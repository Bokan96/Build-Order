# ⚔️ **BUILD ORDER (PRISMATA LITE) — Rulebook v2.0**

A 2-player, perfect-information strategy game about timing, resource management, and breaking defenses.

---

## 🎯 Objective

Each player has a Base with **10 Health**.
You win immediately when your opponent's Base reaches **0 Health**.

---

## 🎲 Resources

There are two primary resources:

### 💰 Gold
* Used to **buy units**
* Carries over between turns

### ⚡ Energy
* Used to **buy multiple units per turn** and **activate abilities**
* Resets to **0 at the end of your turn**

*Note: There is no maximum limit to how much you can hold, but wise spending is key to maintaining momentum.*

---

## 🏁 Setup

* **Starting Resources:** Both players start with 2 Gold and 0 Energy.
* **Starting Units:** Both players begin with 1 **Miner** and 1 **Energizer** (in play and ready).
* **Player 2 Advantage:** The second player receives one additional **Barrier** unit (in play and ready) to compensate for going second.
* **Base Health:** Both players start at 10 HP.

---

## 🔄 Turn Structure

The game operates seamlessly across distinct phases to handle both your actions and incoming combat from your opponent.

### 1️⃣ Start Phase
* Triggers at the official beginning of your turn.
* Energy is reset to 0.

### 2️⃣ Block Phase (Defender)
* Occurs at the start of your turn **if your opponent declared an attack on their previous turn**.
* You evaluate the total incoming attack damage against your forces.
* **Assign Blockers:** You assign any of your **ready** (un-exhausted) units to block. You cannot assign units that are already exhausted.
* *Note: The total block value of your assigned units directly mitigates the incoming attack.*

### 3️⃣ Breach Phase (Attacker)
* If the incoming Attack damage exceeds the assigned Block, a Breach occurs.
* During your turn, your opponent (the Attacker) gets temporary control to allocate unmitigated ("leftover") damage to your units.
* The Attacker can pinpoint and destroy specific unblocked units, paying exactly their remaining Health to destroy them.
* Any unassigned damage directly reduces your Base HP.

### 4️⃣ Action Phase (Active Player)
Once combat resolution concludes, your main phase begins. You may perform these actions in any order:

* **⚙️ Use Abilities:** Many units can activate abilities (like generating gold or energy). Doing this **exhausts** the unit, meaning it *cannot block* on your opponent's upcoming turn!
* **🛒 Buy Units:** You may purchase up to **2 units** per turn from the shop. 
  * The **first unit** costs its base Gold cost.
  * The **second unit** costs its base Gold cost **+ 1 Energy** penalty.
  * Units enter play **Exhausted** (with the exception of Walls).
  * Global Unit Caps: You can own a maximum of **5** of each unit type, except **Walls** (cap of 3).
* **⚔️ Prepare Attackers:** You can exhaust specific combat units (like Strikers and Volatiles) to prepare them for an attack. Most attacking requires **Energy**. Their attack value pools together into a total Attack score that will hit your opponent during *their* Block Phase on the following turn.

### 5️⃣ End Phase
* Your turn concludes.
* Any unit that suffered lethal damage during the turn is officially cleared from the board.
* The turn passes to your opponent.

---

## 🧱 Unit Reference

| Stat | Meaning |
|---|---|
| **Attack (ATK)** | Damage added to the pool when preparing an attack. |
| **Block (BLK)** | Damage absorbed when assigned to block. |
| **Health (HP)** | Damage needed to destroy the unit. |

---

### 🟡 Miner
* **Cost:** 2 Gold
* **Stats:** 0 ATK / 1 BLK / 1 HP
* **Ability — Mine (Exhaust):** Spend **1 Energy → Gain 1 Gold**.
* *Your main economic engine.*

### 🔵 Energizer
* **Cost:** 2 Gold
* **Stats:** 0 ATK / 0 BLK / 2 HP
* **Ability — Generate (Exhaust):** Gain **+1 Energy**.
* *Your energy engine.*

### 🔴 Striker
* **Cost:** 3 Gold
* **Stats:** 2 ATK / 0 BLK / 1 HP
* **Attack Cost:** 1 Energy
* *Cheap but potent attacker; requires energy to swing.*

### 🛡️ Guard
* **Cost:** 3 Gold
* **Stats:** 1 ATK / 2 BLK / 2 HP
* *Standard sturdy defensive unit.*

### 🧱 Wall
* **Cost:** 3 Gold
* **Stats:** 0 ATK / 2 BLK / 2 HP *(Limit 3 per player)*
* **Special:** Walls **enter play ready**. They do not ready automatically at the start of a turn like other units.
* **Ability — Repair (Exhausted, 1 Energy):** Ready this Wall so it can block again next turn.
* *Instant but rigid defensive fortification.*

### ⚡ Repeater
* **Cost:** 3 Gold
* **Stats:** 0 ATK / 1 BLK / 2 HP
* **Ability — Overcharge (Exhaust, 1 Energy):** Ready another unit. Cannot target itself.
* *Excellent utility to double-dip on key abilities or free up a blocker.*

### 💥 Volatile
* **Cost:** 4 Gold
* **Stats:** 5 ATK / 0 BLK / 2 HP
* **Attack Cost:** 1 Energy
* **Trait — Self-Destruct:** This unit sacrifices itself immediately when prepared for an attack, adding massive damage at the cost of its own life.

### 🚧 Barrier
* **Cost:** 1 Gold
* **Stats:** 0 ATK / 1 BLK / 1 HP
* **Trait — Fragile:** If this unit participates in a Block, it is destroyed automatically at the end of the action.
* *Ultra-cheap, disposable blocker to soak up hits.*

---

## 🧠 Strategy Tips
* **Pace Your Economy:** Early game revolves around balancing Miners (Gold) and Energizers (Energy). Building too much economy leaves you vulnerable to a quick Striker rush!
* **Resource Sync:** Having 3 Miners but 0 Energizers means you can't activate them. You must build energy generators alongside your gold miners.
* **Repeater Utility:** The Repeater is highly versatile. It can ready a Miner twice in one turn, or unexhaust a crucial Guard to block an incoming attack.
* **Breach Mindgames:** If you let some damage Breach, your opponent will target your most valuable units. Block wisely!
