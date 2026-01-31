import random

class Agent:
    def __init__(self, strategy_name, logger=None, interactive=False):
        self.strategy_name = strategy_name
        self.logger = logger
        self.interactive = interactive

    def log(self, message):
        if self.logger:
            self.logger.write(f"AI ({self.strategy_name}): {message}\n")
        else:
            print(f"AI ({self.strategy_name}): {message}")

    def execute_turn(self, game, engine):
        active_player = game.current_player
        strat = self.strategy_name

        # 1. Start Phase is handled by the caller or engine naturally if used in main loop
        # But we'll assume we are in Action Phase when called, or handle Defense if needed.

        if game.phase == "Defense":
            self.handle_defense(game, engine)
        
        if game.phase == "Action":
            self.handle_action(game, engine)

    def handle_defense(self, game, engine):
        defender = game.current_player
        
        # Simple defense: check for blockers
        available_blockers = [u for u in defender.units if not u.exhausted and u.block > 0]
        for u in available_blockers:
            success, msg = engine.assign_blockers([(u.name.lower(), 1)])
            if success:
                self.log(f"Blocked with {u.name}")
        
        total_atk = sum(u.attack for u in engine.attacking_units)
        total_blk = sum(u.block for u in engine.blocking_units)
        unblocked = max(0, total_atk - total_blk)
        
        if unblocked > 0:
            if self.interactive and game.other_player.name == "Player 1":
                 self.log(f"Defense Phase: {unblocked} damage unblocked. Waiting for Player 1 to assign damage...")
                 return # Return and let the human assign via command line
            
            assignments = []
            remaining = unblocked
            # AI Target Priority:
            # 1. Kill 0-HP Walls (They are "free" once block is broken)
            # 2. Kill Strikers (Threat removal)
            # 3. Kill resource generators (Miner, Energizer)
            # 4. Hit the base
            targets = ["wall", "striker", "miner", "energizer", "volatile", "overcharger", "guard", "barrier"]
            for t in targets:
                units = [u for u in defender.units if u.name == t and u.current_health > 0 and u.is_alive()]
                for u in units:
                    if remaining >= u.current_health:
                        assignments.append((t.lower(), u.current_health))
                        remaining -= u.current_health
                        self.log(f"Damage assigned to {u.name} (Killed)")
                    if remaining <= 0: break
                if remaining <= 0: break
            
            if remaining > 0:
                assignments.append(("base", remaining))
                self.log(f"Damage assigned to Base: {remaining}")
            
            engine.resolve_combat(assignments)
        
        engine.end_phase()
        engine.action_phase() # Transition to action after defense
        self.handle_action(game, engine)

    def handle_action(self, game, engine):
        active_player = game.current_player
        strat = self.strategy_name

        # Resources
        energizers = active_player.get_units_by_type("energizer")
        for i in range(len(energizers)):
            success, msg = engine.use_ability("energizer", i + 1)
            if success: self.log("Used Energizer")
            
        # Calculate attack potential to reserve energy BEFORE mining or buying
        enemy = game.other_player
        enemy_ready_blockers = [u for u in enemy.units if u.block > 0 and not u.exhausted]
        enemy_block = sum(u.block for u in enemy_ready_blockers)
        
        ready_units = [u for u in active_player.units if not u.exhausted and u.attack > 0]
        energy_for_attack = active_player.energy
        potential_total_damage = 0
        total_attack_energy_cost = 0
        
        for u in ready_units:
            if energy_for_attack >= u.attack_cost:
                potential_total_damage += u.attack
                energy_for_attack -= u.attack_cost
                total_attack_energy_cost += u.attack_cost
        
        reserved_energy = 0
        if potential_total_damage > enemy_block and potential_total_damage > 0:
             reserved_energy = total_attack_energy_cost

        # Random strategy special abilities
        if strat == "Random":
            others = ["overcharger", "volatile"]
            for unit_type in others:
                units = [u for u in active_player.get_units_by_type(unit_type) if not u.exhausted]
                for i in range(len(units)):
                    if random.random() < 0.5:
                        if unit_type == "overcharger":
                            exhausted = [u for u in active_player.units if u.exhausted]
                            if exhausted:
                                engine.use_ability(unit_type, i+1, target=random.choice(exhausted))
                                self.log(f"Used Overcharger on {random.choice(exhausted).name}")
                        else:
                            success, _ = engine.use_ability(unit_type, i+1)
                            if success: self.log(f"Used {unit_type}")

        # Miners
        miners = active_player.get_units_by_type("miner")
        for i in range(len(miners)):
            if active_player.energy <= reserved_energy: break
            success, _ = engine.use_ability("miner", i + 1)
            if success: self.log("Mined 1 Gold")

        # Buying
        purchases = 0
        while purchases < 2:
            bought_this_step = False
            penalty = 1 if purchases == 1 else 0
            
            # General protection for most bots, but Aggressive might prioritize offense
            if strat != "Aggressive" and len(active_player.get_units_by_type("barrier")) < 2:
                if active_player.gold >= 0 and active_player.energy >= (penalty + reserved_energy):
                    success, _ = engine.buy_unit("barrier")
                    if success: 
                        self.log("Bought Barrier")
                        bought_this_step = True
                        purchases += 1
                        continue

            should_skip = random.random() < 0.1

            if strat == "Aggressive":
                num_strikers = len(active_player.get_units_by_type("striker"))
                num_energizers = len(active_player.get_units_by_type("energizer"))
                num_miners = len(active_player.get_units_by_type("miner"))
                
                if not should_skip:
                    if num_strikers < num_energizers:
                        if num_strikers < 5:
                            if active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                                success, _ = engine.buy_unit("striker")
                                if success: 
                                    self.log("Bought Striker")
                                    bought_this_step = True
                    else:
                        if num_energizers < 5:
                             if active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                                success, _ = engine.buy_unit("energizer")
                                if success: 
                                    self.log("Bought Energizer")
                                    bought_this_step = True
                
                if not bought_this_step and num_miners < 5:
                    if active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit("miner")
                        if success: 
                            self.log("Bought Miner")
                            bought_this_step = True
                
                if not bought_this_step:
                     if num_strikers < 5 and active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                         success, _ = engine.buy_unit("striker")
                         if success: 
                             self.log("Bought Striker (fallback)")
                             bought_this_step = True
                     elif num_energizers < 5 and active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                         success, _ = engine.buy_unit("energizer")
                         if success: 
                             self.log("Bought Energizer (fallback)")
                             bought_this_step = True

            elif strat == "Guard":
                if not should_skip and len(active_player.get_units_by_type("guard")) < 5:
                    if active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit("guard")
                        if success: 
                            self.log("Bought Guard")
                            bought_this_step = True
                if not bought_this_step and len(active_player.get_units_by_type("miner")) < 5:
                    if active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit("miner")
                        if success: 
                            self.log("Bought Miner")
                            bought_this_step = True

            elif strat == "Wall":
                if not should_skip and len(active_player.get_units_by_type("wall")) < 5:
                    if active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit("wall")
                        if success: 
                            self.log("Bought Wall")
                            bought_this_step = True
                if not bought_this_step and len(active_player.get_units_by_type("miner")) < 5:
                    if active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit("miner")
                        if success: 
                            self.log("Bought Miner")
                            bought_this_step = True
            
            elif strat == "Random":
                potential_buys = ["miner", "energizer", "striker", "guard", "wall", "overcharger", "volatile"]
                random.shuffle(potential_buys)
                for unit_name in potential_buys:
                    if len(active_player.get_units_by_type(unit_name)) < 5:
                        success, _ = engine.buy_unit(unit_name)
                        if success:
                            self.log(f"Bought {unit_name}")
                            bought_this_step = True
                            break

            elif strat == "Reactive":
                enemy = game.other_player
                all_strikers = enemy.get_units_by_type("striker")
                incoming_damage = len(all_strikers) * 2
                my_blockers = [u for u in active_player.units if u.block > 0 and not u.exhausted]
                current_block = sum(u.block for u in my_blockers)
                need_immediate_block = incoming_damage > current_block
                
                if need_immediate_block:
                     if len(active_player.get_units_by_type("wall")) < 5:
                         if active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                             success, _ = engine.buy_unit("wall")
                             if success: 
                                 self.log("Bought Wall (Reactive Survival)")
                                 bought_this_step = True
                
                if not bought_this_step:
                    if len(active_player.get_units_by_type("miner")) < 2:
                         if active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                            success, _ = engine.buy_unit("miner")
                            if success: 
                                self.log("Bought Miner (Reactive Eco)")
                                bought_this_step = True
                
                if not bought_this_step:
                    enemy_strikers_total = len(enemy.get_units_by_type("striker"))
                    target_unit = None
                    if enemy_strikers_total > 0: target_unit = "guard"
                    
                    if target_unit:
                        if len(active_player.get_units_by_type(target_unit)) < 5:
                             success, _ = engine.buy_unit(target_unit)
                             if success: 
                                 self.log(f"Bought {target_unit} (Reactive Counter)")
                                 bought_this_step = True

                    if not bought_this_step:
                         if active_player.gold >= 2 and active_player.energy >= penalty:
                            success, _ = engine.buy_unit("miner")
                            if success: 
                                self.log("Bought Miner (Reactive Default)")
                                bought_this_step = True
            
            if bought_this_step: purchases += 1
            else: break

        # Attack
        ready_units = [u for u in active_player.units if not u.exhausted and u.attack > 0]
        if ready_units:
            energy_avail = active_player.energy
            units_to_use = {} # type: count
            total_damage = 0
            
            # Sort units to use those with lower attack cost first? 
            # Or maybe those with higher attack efficiency.
            # For now, just iterate and take what we can afford.
            for u in ready_units:
                if energy_avail >= u.attack_cost:
                    u_type = u.name.lower()
                    units_to_use[u_type] = units_to_use.get(u_type, 0) + 1
                    energy_avail -= u.attack_cost
                    total_damage += u.attack
            
            if total_damage > enemy_block:
                 if total_damage > 0:
                     unit_list = list(units_to_use.items())
                     success, msg = engine.prepare_attackers(unit_list)
                     if success: self.log(f"Attacking with {total_damage} damage using {unit_list}")
