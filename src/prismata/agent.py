import random

class Agent:
    def __init__(self, strategy_name, logger=None, interactive=False):
        self.strategy_name = strategy_name
        self.logger = logger
        self.interactive = interactive
        self.turn_actions = []

    def log(self, message, turn=None):
        turn_str = f" [Turn {turn}]" if turn else ""
        if self.logger:
            self.logger.write(f"AI ({self.strategy_name}){turn_str}: {message}\n")
        # Console output for AI actions is handled by summaries in main.py

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
        
        # Only clear actions if we've moved to a new turn round or changed player
        turn_key = f"{game.turn_number}_{active_player.name}"
        if not hasattr(self, '_last_turn_key') or self._last_turn_key != turn_key:
            self.turn_actions = []
            self._last_turn_key = turn_key

        if game.phase == "Defense":
            self.handle_defense(game, engine)
            
        if game.phase == "Assignment":
            self.handle_assignment(game, engine)
        
        if game.phase == "Action":
            self.handle_action(game, engine)
        
        # Summarize actions at end of turn
        summary = []
        counts = {}
        order = []
        for a in self.turn_actions:
            if a not in counts: order.append(a)
            counts[a] = counts.get(a, 0) + 1
            
        for a in order:
            count = counts[a]
            summary.append(f"{a} (x{count})" if count > 1 else a)
            
        return summary

    def record_action(self, action):
        self.turn_actions.append(action)

    def handle_defense(self, game, engine):
        defender = game.current_player
        strat = self.strategy_name
        
        # Calculate incoming
        total_atk = sum(u.attack for u in engine.attacking_units)
        
        # Simple defense: check for blockers
        available_blockers = [u for u in defender.units if not u.exhausted and u.block > 0]
        # Sort blockers by priority:
        # 1. Guards/Strikers (best blockers, no drawbacks)
        # 2. Economic units (Miner, Energizer - preserve if possible but use if needed)
        # 3. Walls (cost energy to repair)
        # 4. Barriers (destroyed on block - last resort)
        def blocker_priority(unit):
            if unit.name == "Barrier":
                return 4  # Last resort - destroyed on block
            elif unit.name == "Wall":
                return 3  # Avoid - costs energy to repair
            elif unit.name in ["Miner", "Energizer"]:
                return 2  # Preserve economic units
            else:
                return 1  # Guards, Strikers, etc. - use first
        
        available_blockers.sort(key=blocker_priority)
        
        blocked_units = {}
        for u in available_blockers:
            total_blk = sum(u.block for u in engine.blocking_units)
            unblocked = max(0, total_atk - total_blk)
            if unblocked <= 0: break
            
            success, msg = engine.assign_blockers([(u.name.lower(), 1)])
            if success:
                blocked_units[u.name] = blocked_units.get(u.name, 0) + 1
        
        if blocked_units:
            summary = ", ".join([f"{count} {name}{'s' if count > 1 else ''}" for name, count in blocked_units.items()])
            if self.logger:
                self.logger.write(f"{defender.name} blocked with: {summary}\n")
            self.record_action(f"Blocked with {summary}")
        
        total_blk = sum(u.block for u in engine.blocking_units)
        unblocked = max(0, total_atk - total_blk)
        
        if unblocked > 0:
            # In the web version, if Player 1 is attacking the AI, 
            # we want Player 1 to manually assign the breach damage.
            if game.other_player.name == game.player1.name:
                 self.log(f"Defense Phase: {unblocked} damage unblocked. Waiting for Player 1 to assign damage...")
                 return # Return and let the human assign via UI
            
            assignments = self.assign_damage(game, engine, unblocked)
            engine.resolve_combat(assignments)
        
        # Note: Phase transition is handled by the caller (main.py)

    def handle_assignment(self, game, engine):
        """Handle the Assignment phase (Attacker assigns damage)."""
        # Calculate remaining unassigned damage
        total_atk = sum(u.attack for u in engine.attacking_units)
        total_blk = sum(u.block for u in engine.blocking_units)
        remaining = max(0, total_atk - total_blk - engine.assigned_damage)
        
        if remaining > 0:
            assignments = self.assign_damage(game, engine, remaining)
            success, msg = engine.resolve_combat(assignments)
            if success:
                self.log(f"Assignment Phase: Resolved combat. {msg}")
            else:
                self.log(f"Assignment Phase: Failed to resolve combat. {msg}")
        
        # Done with assignment, move to Action
        engine.end_phase()
        engine.action_phase()

    def assign_damage(self, game, engine, amount):
        """AI logic to assign damage to the opponent's board."""
        defender = game.current_player
        assignments = []
        remaining = amount
        
        # Check if we can finish the game
        can_finish_game = remaining >= defender.base_health
        is_aggressive = self.strategy_name == "Aggressive"
        
        # AI Target Priority:
        # If can finish game OR is aggressive: Hit base immediately
        # Otherwise: Kill units first, then base
        if can_finish_game or is_aggressive:
            # Go for the kill or play aggressively
            assignments.append(("base", remaining))
            self.log(f"Damage assigned to Base: {remaining} (Finishing move)" if can_finish_game else f"Damage assigned to Base: {remaining} (Aggressive)")
            return assignments
        
        # Standard priority: Kill units first
        # 1. Kill 0-HP Walls (They are "free" once block is broken)
        # 2. Kill Strikers (Threat removal)
        # 3. Kill resource generators (Miner, Energizer)
        # 4. Hit the base with leftovers
        targets = ["wall", "striker", "miner", "energizer", "volatile", "repeater", "overcharger", "guard", "barrier"]
        for t in targets:
            # Match using lowercase name to avoid case sensitivity issues
            units = [u for u in defender.units if u.name.lower() == t and u.current_health > 0 and u.is_alive()]
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

    def _get_opponent_threat(self, opponent):
        """Calculate maximum potential damage the opponent can deal on their turn."""
        # Potential energy from current Energizers
        num_energizers = len(opponent.get_units_by_type("energizer"))
        energy = num_energizers
        
        # Base threat from free attackers (Guard, Overcharger, etc.)
        threat = 0
        for u in opponent.units:
            if u.name not in ["Striker", "Volatile"] and u.attack > 0:
                threat += u.attack
        
        # Power the most efficient attackers first
        # Volatiles: 1 energy for 5 damage (high efficiency attacker)
        num_volatiles = len(opponent.get_units_by_type("volatile"))
        powered_volatiles = min(num_volatiles, energy)
        threat += powered_volatiles * 5
        energy -= powered_volatiles
        
        # Strikers: 1 energy for 2 damage
        num_strikers = len(opponent.get_units_by_type("striker"))
        powered_strikers = min(num_strikers, energy)
        threat += powered_strikers * 2
        energy -= powered_strikers
        
        return threat

    def handle_action(self, game, engine):
        active_player = game.current_player
        strat = self.strategy_name

        # Resources
        energizers = active_player.get_units_by_type("energizer")
        energizers_used = 0
        for i in range(len(energizers)):
            success, msg = engine.use_ability("energizer", i + 1)
            if success:
                energizers_used += 1
                self.record_action("Used Energizer")
        
        if energizers_used > 0:
            self.log(f"Used {energizers_used} Energizers")
            
        # Calculate attack potential to reserve energy BEFORE mining or buying
        enemy = game.other_player
        enemy_ready_blockers = [u for u in enemy.units if u.block > 0 and not u.exhausted]
        enemy_block = sum(u.block for u in enemy_ready_blockers)
        enemy_potential_attack = self._get_opponent_threat(enemy)
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
        
        # New Rule: Reserved energy ALWAYS includes Striker costs 
        # (because they always attack to force wall exhaustion)
        strikers_ready = [u for u in active_player.get_units_by_type("striker") if not u.exhausted]
        striker_energy_needed = len(strikers_ready)
        
        reserved_energy = min(active_player.energy, striker_energy_needed)
        
        # If we have a potential breach with other units, add that too
        if potential_total_damage > enemy_block and potential_total_damage > striker_energy_needed:
             reserved_energy = max(reserved_energy, total_attack_energy_cost)

        # Ability Use (Non-Miner)
        
        # 1. Wall Repair (Reactive Mode)
        # Only repair if threatened, or if we have abundance of energy
        is_threatened = enemy_potential_attack > my_total_block
        exhausted_walls = [u for u in active_player.get_units_by_type("wall") if u.exhausted]
        for i in range(len(exhausted_walls)):
            should_repair = False
            if is_threatened:
                should_repair = True
            elif active_player.energy > (reserved_energy + 2): # Spare energy
                should_repair = True
                
            if should_repair and active_player.energy > 0:
                success, _ = engine.use_ability("wall", i+1)
                if success: 
                    self.log("Repaired Wall")
                    self.record_action("Repaired Wall")
                    my_total_block += 2
                    is_threatened = enemy_potential_attack > my_total_block

        if strat == "Random" or strat == "Aggressive":
            others = ["repeater", "volatile"]
            for unit_type in others:
                units = [u for u in active_player.get_units_by_type(unit_type) if not u.exhausted]
                for i in range(len(units)):
                    # Aggressive always uses them if it helps breach, Random is 50/50
                    if strat == "Aggressive" or random.random() < 0.5:
                        if unit_type == "repeater":
                            # Target the best unit (highest attack or most useful)
                            exhausted = [u for u in active_player.units if u.exhausted and u.is_alive()]
                            if exhausted:
                                # Prioritize readying Strikers or other offensive units
                                target = next((u for u in exhausted if u.name == "Striker"), random.choice(exhausted))
                                engine.use_ability(unit_type, i+1, target=target)
                                self.log(f"Used Repeater on {target.name}")
                        else:
                            # Other abilities... (Non-volatile now)
                            pass

        # Miners
        miners = active_player.get_units_by_type("miner")
        miners_used = 0
        for i in range(len(miners)):
            if active_player.energy <= reserved_energy: break
            # ECONOMIC CAP: Stop mining if already wealthy, UNLESS we have spare energy
            if active_player.gold > 5 and active_player.energy <= reserved_energy + 1: break
            success, _ = engine.use_ability("miner", i + 1)
            if success:
                miners_used += 1
                self.record_action("Used Miner")
        if miners_used > 0:
            self.log(f"Used {miners_used} Miners")

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
                        self.record_action("Bought Barrier")
                        bought_this_step = True
                        purchases += 1
                        continue

            if random.random() < 0.05:
                potential_puys = ["miner", "energizer", "striker", "guard", "wall", "repeater", "volatile", "barrier"]
                unit_name = self.get_economic_target(active_player, random.choice(potential_puys))
                cap = 3 if unit_name == "wall" else 5
                if active_player.lifetime_units.get(unit_name, 0) < cap:
                    success, _ = engine.buy_unit(unit_name)
                    if success:
                        self.log(f"RANDOM ACTION: Bought {unit_name}")
                        self.record_action(f"Bought {unit_name}")
                        bought_this_step = True
                        purchases += 1
                        continue

            should_skip = random.random() < 0.1

            # EMERGENCY DEFENSE: Buy Wall if enemy attack exceeds our current block (Limit 3)
            num_walls = active_player.lifetime_units.get("wall", 0)
            if (enemy_potential_attack > my_total_block) and active_player.gold >= 3 and num_walls < 3:
                success, _ = engine.buy_unit("wall")
                if success:
                    self.log("Bought Wall")
                    self.record_action("Bought Wall")
                    bought_this_step = True
                    purchases += 1
                    my_total_block += 2 # Update block count
                    continue

            # KILLER INSTINCT: If our damage is enough to meet or breach enemy block, push for a win
            if potential_total_damage >= enemy_block and active_player.gold >= 3:
                success, _ = engine.buy_unit("striker")
                if success:
                    self.log("KILLER INSTINCT: Offensive window, buying striker")
                    self.record_action("Bought Striker")
                    bought_this_step = True
                    purchases += 1
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
                                    self.record_action("Bought Striker")
                                    bought_this_step = True
                    else:
                        if num_energizers < 5:
                             if active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                                success, _ = engine.buy_unit("energizer")
                                if success: 
                                    self.log("Bought Energizer")
                                    self.record_action("Bought Energizer")
                                    bought_this_step = True
                
                if not bought_this_step and num_miners < 5:
                    target_unit = self.get_economic_target(active_player, "miner")
                    if active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit(target_unit)
                        if success: 
                            self.log(f"Bought {target_unit}")
                            self.record_action(f"Bought {target_unit}")
                            bought_this_step = True
                
                if not bought_this_step:
                     if num_strikers < 5 and active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                         # BREACH TACTIC: If enemy has high block, consider Volatile instead of Striker
                         if enemy_block > 3 and active_player.gold >= 4:
                             success, _ = engine.buy_unit("volatile")
                             if success: 
                                 self.log("Aggressive: Buying Volatile for breach")
                                 self.record_action("Bought Volatile")
                                 bought_this_step = True
                         
                         if not bought_this_step:
                             success, _ = engine.buy_unit("striker")
                             if success: 
                                 self.log("Bought Striker")
                                 self.record_action("Bought Striker")
                                 bought_this_step = True
                     elif num_energizers < 5 and active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                         success, _ = engine.buy_unit("energizer")
                         if success: 
                             self.log("Bought Energizer")
                             self.record_action("Bought Energizer")
                             bought_this_step = True

            elif strat == "Guard" or strat == "Wall":
                # GREEDY DEFENSIVE: Only buy defense if threatened, else economy/counter
                enemy = game.other_player
                incoming = self._get_opponent_threat(enemy)
                my_block = sum(u.block for u in active_player.units if not u.exhausted)
                
                if incoming > my_block:
                    unit_to_buy = "wall" if strat == "Wall" else "guard"
                    if active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit(unit_to_buy)
                        if success:
                            self.log(f"Bought {unit_to_buy}")
                            self.record_action(f"Bought {unit_to_buy}")
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
                                self.record_action("Bought Striker")
                                bought_this_step = True

                    if not bought_this_step and num_miners < 5 and active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                        target_unit = self.get_economic_target(active_player, "miner")
                        success, _ = engine.buy_unit(target_unit)
                        if success:
                            self.log(f"Greedy: Investing in {target_unit}")
                            self.record_action(f"Bought {target_unit}")
                            bought_this_step = True
                    # Then Counter-Attack
                    elif not bought_this_step:
                        num_strikers = active_player.lifetime_units.get("striker", 0)
                        if num_strikers < 4 and active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                            success, _ = engine.buy_unit("striker")
                            if success:
                                self.log("Greedy: Building counter-striker")
                                self.record_action("Bought Striker")
                                bought_this_step = True
            
            elif strat == "Random":
                potential_buys = ["miner", "energizer", "striker", "guard", "wall", "repeater", "volatile"]
                random.shuffle(potential_buys)
                for unit_name in potential_buys:
                    cap = 3 if unit_name == "wall" else 5
                    if active_player.lifetime_units.get(unit_name, 0) < cap:
                        success, _ = engine.buy_unit(unit_name)
                        if success:
                            self.log(f"Bought {unit_name}")
                            self.record_action(f"Bought {unit_name}")
                            bought_this_step = True
                            break

            elif strat == "Reactive":
                enemy = game.other_player
                # KILLER INSTINCT for Reactive: If we have defense, build more offense
                num_strikers = active_player.lifetime_units.get("striker", 0)
                
                # Improved Reactive: Match damage + stay 2 ahead for safety
                incoming_damage = self._get_opponent_threat(enemy)
                my_blockers = [u for u in active_player.units if u.block > 0 and not u.exhausted]
                # Barriers are fragile, count them as half-strength for long-term planning
                current_block = sum(u.block if u.name != "Barrier" else 0.5 for u in my_blockers)
                
                # PRE-EMPTIVE: If enemy has multiple attackers, get a baseline Wall
                num_threats = len([u for u in enemy.units if u.attack > 0])
                if num_threats > 1 and active_player.lifetime_units.get("wall", 0) < 1:
                    if active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit("wall")
                        if success:
                            self.log("Bought Wall")
                            self.record_action("Bought Wall")
                            bought_this_step = True

                if not bought_this_step and incoming_damage + 2 > current_block:
                    # Prioritize Wall if massive gap, otherwise Guard
                    target_def = "wall" if (incoming_damage + 2 - current_block) >= 2 else "guard"
                    if active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit(target_def)
                        if success:
                            self.log(f"Bought {target_def}")
                            self.record_action(f"Bought {target_def}")
                            bought_this_step = True
                
                # If defense is solid, build economy or counter-attack
                if not bought_this_step:
                    if active_player.lifetime_units.get("miner", 0) < 3:
                        target_unit = self.get_economic_target(active_player, "miner")
                        if active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                            success, _ = engine.buy_unit(target_unit)
                            if success:
                                self.log(f"Reactive: Secure, expanding {target_unit}")
                                self.record_action(f"Bought {target_unit}")
                                bought_this_step = True
                    elif active_player.lifetime_units.get("striker", 0) < 3:
                        if active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                            success, _ = engine.buy_unit("striker")
                            if success:
                                self.log("Bought Striker")
                                self.record_action("Bought Striker")
                                bought_this_step = True
                    else:
                        # Default to buying miners
                        target_unit = self.get_economic_target(active_player, "miner")
                        if active_player.gold >= 2 and active_player.energy >= penalty:
                            success, _ = engine.buy_unit(target_unit)
                            if success:
                                self.log(f"Reactive: Defaulting to {target_unit}")
                                self.record_action(f"Bought {target_unit}")
                                bought_this_step = True
            
            elif strat == "Tactical":
                # TACTICAL: Prioritize economy, then defensive walls, then counter-attack
                num_miners = active_player.lifetime_units.get("miner", 0)
                num_energizers = active_player.lifetime_units.get("energizer", 0)
                num_walls = active_player.lifetime_units.get("wall", 0)
                num_strikers = active_player.lifetime_units.get("striker", 0)

                # 1. Critical Defense
                if enemy_potential_attack > my_total_block and active_player.gold >= 3 and num_walls < 3:
                    success, _ = engine.buy_unit("wall")
                    if success:
                        self.log("Tactical: Buying Wall for defense")
                        self.record_action("Bought Wall")
                        bought_this_step = True
                        my_total_block += 2
                
                # 2. Economy Scaling
                if not bought_this_step and (num_miners < 4 or num_energizers < 3):
                    target_unit = "miner" if num_miners <= num_energizers else "energizer"
                    if active_player.gold >= 2 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit(target_unit)
                        if success:
                            self.log(f"Tactical: Scaling economy with {target_unit}")
                            self.record_action(f"Bought {target_unit}")
                            bought_this_step = True
                
                # 3. Defensive padding
                if not bought_this_step and enemy_potential_attack + 2 > my_total_block and num_walls < 3:
                     if active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit("wall")
                        if success:
                            self.log("Tactical: Adding defensive padding")
                            self.record_action("Bought Wall")
                            bought_this_step = True
                
                # 4. Counter-Attack (only if economy is good)
                if not bought_this_step and num_miners >= 3 and num_strikers < 4:
                    if active_player.gold >= 3 and active_player.energy >= (penalty + reserved_energy):
                        success, _ = engine.buy_unit("striker")
                        if success:
                            self.log("Tactical: Economy secure, building counter-attack")
                            self.record_action("Bought Striker")
                            bought_this_step = True
            
            # BARRIER TACTIC: Only buy if we have spare resources after doing our initial purchase
            # Condition: purchases > 0, gold > 3, and sufficient energy for second unit + reserved
            if not bought_this_step and purchases > 0 and len(active_player.get_units_by_type("barrier")) < 5:
                if active_player.gold > 3 and active_player.energy >= (penalty + reserved_energy + 1):
                    success, _ = engine.buy_unit("barrier")
                    if success:
                        self.log("BARRIER TACTIC: Adding cheap protection with surplus resources")
                        self.record_action("Bought Barrier")
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
                    # Logic to decide if this unit should attack
                    should_attack = False
                    if u.name == "Striker":
                        should_attack = True # Strikers ALWAYS attack if energy available
                    elif u.name == "Guard":
                        # Guards attack if safe OR if we have a breach (destroying enemy units > blocking them)
                        if enemy_potential_attack == 0:
                            should_attack = True
                        elif potential_total_damage > enemy_block:
                            should_attack = True
                    elif u.name == "Volatile" and (u.attack > 0): # Detonated volatiles always attack
                        should_attack = True
                    elif u.name not in ["Striker", "Guard", "Volatile"] and u.attack > 0:
                        # Other units (like Overcharger/Energizer) attack if possible
                        should_attack = True

                    if should_attack:
                        u_type = u.name.lower()
                        units_to_use[u_type] = units_to_use.get(u_type, 0) + 1
                        energy_avail -= u.attack_cost
                        total_damage += u.attack
            
            if total_damage > 0:
                unit_list = list(units_to_use.items())
                success, msg = engine.prepare_attackers(unit_list)
                if success:
                    action_str = f"Attacking with {total_damage} damage using {', '.join([f'{c} {t.capitalize()}' for t,c in unit_list])}"
                    self.log(action_str, turn=game.turn_number)
                    self.record_action(action_str)
