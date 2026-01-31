import random

class Agent:
    def __init__(self, strategy_name, logger=None, interactive=False):
        self.strategy_name = strategy_name
        self.logger = logger
        self.interactive = interactive

    def log(self, message, turn=None):
        turn_str = f" [Turn {turn}]" if turn else ""
        if self.logger:
            self.logger.write(f"AI ({self.strategy_name}){turn_str}: {message}\n")
        else:
            print(f"AI ({self.strategy_name}){turn_str}: {message}")

    def get_economic_target(self, active_player, preferred_unit):
        """Rule: Buy energizers instead of Miners if num_energizers < num_miners."""
        if preferred_unit == "miner":
            num_miners = len(active_player.get_units_by_type("miner"))
            num_energizers = len(active_player.get_units_by_type("energizer"))
            if num_energizers < num_miners:
                return "energizer"
        return preferred_unit

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
            
            assignments = self.assign_damage(game, engine, unblocked)
            engine.resolve_combat(assignments)
        
        engine.end_phase()
        engine.action_phase() # Transition to action after defense
        self.handle_action(game, engine)

    def assign_damage(self, game, engine, amount):
        """AI logic to assign damage to the opponent's board."""
        defender = game.current_player
        assignments = []
        remaining = amount
        
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
        
        return assignments

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
        enemy_potential_attack = sum(u.attack for u in enemy.units if not u.exhausted)
        my_total_block = sum(u.block for u in active_player.units if not u.exhausted)
        
        ready_units = [u for u in active_player.units if not u.exhausted and (u.attack > 0 or u.name == "Volatile")]
        energy_for_attack = active_player.energy
        potential_total_damage = 0
        total_attack_energy_cost = 0
        
        for u in ready_units:
            # For Volatile, we assume we will detonate (cost 1, gain 5)
            if u.name == "Volatile":
                if energy_for_attack >= 1:
                    potential_total_damage += 5
                    energy_for_attack -= 1
                    total_attack_energy_cost += 1
            elif energy_for_attack >= u.attack_cost:
                potential_total_damage += u.attack
                energy_for_attack -= u.attack_cost
                total_attack_energy_cost += u.attack_cost
        
        reserved_energy = 0
        if potential_total_damage > enemy_block and potential_total_damage > 0:
             reserved_energy = total_attack_energy_cost

        # Ability Use (Non-Miner)
        if strat == "Random" or strat == "Aggressive":
            others = ["overcharger", "volatile"]
            for unit_type in others:
                units = [u for u in active_player.get_units_by_type(unit_type) if not u.exhausted]
                for i in range(len(units)):
                    # Aggressive always uses them if it helps breach, Random is 50/50
                    if strat == "Aggressive" or random.random() < 0.5:
                        if unit_type == "overcharger":
                            # Target the best unit (highest attack or most useful)
                            exhausted = [u for u in active_player.units if u.exhausted]
                            if exhausted:
                                # Prioritize readying Strikers or Volatiles
                                target = next((u for u in exhausted if u.name in ["Volatile", "Striker"]), random.choice(exhausted))
                                engine.use_ability(unit_type, i+1, target=target)
                                self.log(f"Used Overcharger on {target.name}")
                        else:
                            # Volatile: only detonate if enemy has block or if we are aggressive
                            if strat == "Aggressive" or enemy_block > 0:
                                success, _ = engine.use_ability(unit_type, i+1)
                                if success: self.log(f"Used {unit_type}")

        # Miners
        miners = active_player.get_units_by_type("miner")
        for i in range(len(miners)):
            if active_player.energy <= reserved_energy: break
            # ECONOMIC CAP: Stop mining if already wealthy, UNLESS we have spare energy
            if active_player.gold > 5 and active_player.energy <= reserved_energy + 1: break
            success, _ = engine.use_ability("miner", i + 1)
            if success: self.log("Mined 1 Gold")

        # Buying
        purchases = 0
        while purchases < 2:
            bought_this_step = False
            penalty = 1 if purchases == 1 else 0
            
            # General protection for most bots, but Aggressive might prioritize offense
            if strat != "Aggressive" and active_player.lifetime_units.get("barrier", 0) < 2:
                if active_player.gold >= 0 and active_player.energy >= (penalty + reserved_energy):
                    success, _ = engine.buy_unit("barrier")
                    if success: 
                        self.log("Bought Barrier")
                        bought_this_step = True
                        purchases += 1
                        continue

            if random.random() < 0.05:
                potential_puys = ["miner", "energizer", "striker", "guard", "wall", "overcharger", "volatile", "barrier"]
                unit_name = self.get_economic_target(active_player, random.choice(potential_puys))
                cap = 3 if unit_name == "wall" else 5
                if active_player.lifetime_units.get(unit_name, 0) < cap:
                    success, _ = engine.buy_unit(unit_name)
                    if success:
                        self.log(f"RANDOM ACTION: Bought {unit_name}")
                        bought_this_step = True
                        purchases += 1
                        continue

            should_skip = random.random() < 0.1

            # KILLER INSTINCT: If our damage is enough to meet or breach enemy block, push for a win
            if potential_total_damage >= enemy_block and active_player.gold >= 3:
                success, _ = engine.buy_unit("striker")
                if success:
                    self.log("KILLER INSTINCT: Offensive window, buying striker")
                    bought_this_step = True
                    purchases += 1
                    continue

            # EMERGENCY DEFENSE: Buy Wall if enemy attack exceeds our current block (Limit 3)
            num_walls = active_player.lifetime_units.get("wall", 0)
            if enemy_potential_attack > my_total_block and active_player.gold >= 3 and num_walls < 3:
                success, _ = engine.buy_unit("wall")
                if success:
                    self.log("EMERGENCY DEFENSE: Threat detected, bought Wall")
                    bought_this_step = True
                    purchases += 1
                    my_total_block += 2 # Update block count
                    continue

            if strat == "Aggressive":
                num_strikers = active_player.lifetime_units.get("striker", 0)
                num_energizers = active_player.lifetime_units.get("energizer", 0)
                num_miners = active_player.lifetime_units.get("miner", 0)
                
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
                    target_unit = self.get_economic_target(active_player, "miner")
                    if active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit(target_unit)
                        if success: 
                            self.log(f"Bought {target_unit}")
                            bought_this_step = True
                
                if not bought_this_step:
                     if num_strikers < 5 and active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                         # BREACH TACTIC: If enemy has high block, consider Volatile instead of Striker
                         if enemy_block > 3 and active_player.gold >= 4:
                             success, _ = engine.buy_unit("volatile")
                             if success: 
                                 self.log("Aggressive: Buying Volatile for breach")
                                 bought_this_step = True
                         
                         if not bought_this_step:
                             success, _ = engine.buy_unit("striker")
                             if success: 
                                 self.log("Bought Striker (fallback)")
                                 bought_this_step = True
                     elif num_energizers < 5 and active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                         success, _ = engine.buy_unit("energizer")
                         if success: 
                             self.log("Bought Energizer (fallback)")
                             bought_this_step = True

            elif strat == "Guard" or strat == "Wall":
                # GREEDY DEFENSIVE: Only buy defense if threatened, else economy/counter
                enemy = game.other_player
                incoming = sum(u.attack for u in enemy.units if not u.exhausted or u.name == "Striker") # Striker logic
                my_block = sum(u.block for u in active_player.units if not u.exhausted)
                
                if incoming > my_block:
                    unit_to_buy = "wall" if strat == "Wall" else "guard"
                    if active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit(unit_to_buy)
                        if success:
                            self.log(f"Threat detected! Bought {unit_to_buy}")
                            bought_this_step = True
                
                if not bought_this_step:
                    # Invest in Economy first
                    num_miners = active_player.lifetime_units.get("miner", 0)
                    # VICTORY PATH: If wealthy, stop eco and go all-in on offense
                    if active_player.gold > 6:
                        if active_player.energy >= (penalty + reserved_energy):
                            success, _ = engine.buy_unit("striker")
                            if success:
                                self.log("Greedy: Wealthy! Switching to counter-attack")
                                bought_this_step = True

                    if not bought_this_step and num_miners < 5 and active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                        target_unit = self.get_economic_target(active_player, "miner")
                        success, _ = engine.buy_unit(target_unit)
                        if success:
                            self.log(f"Greedy: Investing in {target_unit}")
                            bought_this_step = True
                    # Then Counter-Attack
                    elif not bought_this_step:
                        num_strikers = active_player.lifetime_units.get("striker", 0)
                        if num_strikers < 4 and active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                            success, _ = engine.buy_unit("striker")
                            if success:
                                self.log("Greedy: Building counter-striker")
                                bought_this_step = True
            
            elif strat == "Random":
                potential_buys = ["miner", "energizer", "striker", "guard", "wall", "overcharger", "volatile"]
                random.shuffle(potential_buys)
                for unit_name in potential_buys:
                    cap = 3 if unit_name == "wall" else 5
                    if active_player.lifetime_units.get(unit_name, 0) < cap:
                        success, _ = engine.buy_unit(unit_name)
                        if success:
                            self.log(f"Bought {unit_name}")
                            bought_this_step = True
                            break

            elif strat == "Reactive":
                enemy = game.other_player
                # KILLER INSTINCT for Reactive: If we have defense, build more offense
                num_strikers = active_player.lifetime_units.get("striker", 0)
                
                # Improved Reactive: Match damage + stay 2 ahead for safety
                incoming_damage = sum(u.attack for u in enemy.units if not u.exhausted)
                my_blockers = [u for u in active_player.units if u.block > 0 and not u.exhausted]
                # Barriers are fragile, count them as half-strength for long-term planning
                current_block = sum(u.block if u.name != "Barrier" else 0.5 for u in my_blockers)
                
                # PRE-EMPTIVE: If enemy has multiple attackers, get a baseline Wall
                num_threats = len([u for u in enemy.units if u.attack > 0])
                if num_threats > 1 and active_player.lifetime_units.get("wall", 0) < 1:
                     if active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit("wall")
                        if success:
                            self.log("Reactive: Pre-emptive Wall vs group")
                            bought_this_step = True

                if not bought_this_step and incoming_damage + 2 > current_block:
                    # Prioritize Wall if massive gap, otherwise Guard
                    target_def = "wall" if (incoming_damage + 2 - current_block) >= 2 else "guard"
                    if active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit(target_def)
                        if success:
                            self.log(f"Reactive: Matching threat with {target_def}")
                            bought_this_step = True
                
                # If defense is solid, build economy or counter-attack
                if not bought_this_step:
                    if active_player.lifetime_units.get("miner", 0) < 3:
                        target_unit = self.get_economic_target(active_player, "miner")
                        if active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                            success, _ = engine.buy_unit(target_unit)
                            if success:
                                self.log(f"Reactive: Secure, expanding {target_unit}")
                                bought_this_step = True
                    elif active_player.lifetime_units.get("striker", 0) < 3:
                        if active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                            success, _ = engine.buy_unit("striker")
                            if success:
                                self.log("Reactive: Secure, building counter-attack")
                                bought_this_step = True
                    else:
                        # Default to buying miners
                        target_unit = self.get_economic_target(active_player, "miner")
                        if active_player.gold >= 2 and active_player.energy >= penalty:
                            success, _ = engine.buy_unit(target_unit)
                            if success:
                                self.log(f"Reactive: Defaulting to {target_unit}")
                                bought_this_step = True
            
            # LAST RESORT / SPARE ENERGY: Buy Barrier if we decided to buy nothing or have leftover energy
            if not bought_this_step and len(active_player.get_units_by_type("barrier")) < 5:
                should_buy_barrier = False
                if purchases == 0 and active_player.gold >= 1:
                    should_buy_barrier = True
                elif purchases == 1 and active_player.gold >= 1 and active_player.energy >= (penalty + reserved_energy + 1):
                    # Only buy a 2nd barrier if we have energy left over for next turn or defense
                    should_buy_barrier = True
                
                if should_buy_barrier:
                    success, _ = engine.buy_unit("barrier")
                    if success:
                        self.log("LAST RESORT: Buying Barrier with spare resources")
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
                     if success: self.log(f"Attacking with {total_damage} damage using {unit_list}", turn=game.turn_number)
