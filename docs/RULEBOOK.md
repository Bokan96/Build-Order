# ⚔️ **PRISMATA LITE — Rulebook v1.0**

A 2-player, perfect-information strategy game about timing, resource management, and breaking defenses.

---

## 🧩 Components

* Unit cards (8 types)
* 6 dice (used as resource trackers)
* 2 Base HP trackers (or pen & paper)

---

## 🎯 Objective

Each player has a **Base with 10 Health**.

You win immediately when your opponent's Base reaches **0 Health**.

---

## 🎲 Resources

There are only **two resources**:

### 💰 Gold

* Used to **buy units**
* Carries over between turns
* Tracked with dice

### ⚡ Energy

* Used to **buy advanced units** and **activate abilities**
* Resets to **0 at end of your turn**
* Tracked with dice

There is no limit to how much you can hold, but totals are designed to usually stay within dice range.

---

### 🏁 Setup

* **2 Gold** and **1 Energy**
* **1 Miner** and **1 Energizer** (Ready)
* **Player 2 Advantage:** Starts with one additional **Barrier** unit (Ready).

Both players set their Base to **10 Health**.
Choose a starting player randomly.

---

## 🔄 Turn Structure

Players alternate turns. Each turn has up to **4 phases**:

---

### 1️⃣ Start Phase

* **Ready Units:** All your exhausted units become ready to use.
* **Maintenance:** Any damage taken by units that didn't die is reset.

---

### 2️⃣ Action Phase

You may perform these in any order:

#### ⚙️ Use Abilities
* Units with abilities must **exhaust** to use them.
* **Important:** If you use a unit here, it is exhausted and **cannot block** in the following Defense Phase of this turn!

#### 🛒 Buy Units
* You may buy up to **2 units** per turn.
* **Cost:** Pay the unit's cost. **Penalty:** The second unit costs **+1 Energy**.
* **Global Cap:** Max **5** of each type (**3** for Walls).
* New units enter play **EXHAUSTED**.

#### ⚔️ Prepare Attackers
* Exhaust units you want to attack with.
* **Cost:** **Striker** costs **1 Energy** to attack.
* *Attacks resolve at the end of your opponent's next turn (during their Defense Phase).*

---

### 3️⃣ Defense Phase ⚠️ (Conditional)

*This phase occurs at the end of your turn if your opponent attacked on their last turn.*

1. **Incoming Attack:** You are shown the total damage incoming.
2. **Assign Blockers (Defender):** You may assign any number of **ready** units to block.
   * Units used in the Action Phase are already exhausted and unavailable!
   * **Your Units:** They can choose to destroy specific targets.
   * **Your Base:** Any remaining damage hits your Base.

*Strategy:* If you block everything, the opponent cannot target your units! If you let damage through, they choose what dies.

---

### 4️⃣ End Phase

* All units that took lethal damage are discarded
* Your Energy resets to **0**
* Your prepared attack is queued for your opponent

---

## 🛡️ Combat Rules Summary

| Stat             | Meaning                           |
| ---------------- | --------------------------------- |
| **Attack (ATK)** | Damage dealt when attacking       |
| **Block (BLK)**  | Damage absorbed when blocking     |
| **Health (HP)**  | Damage needed to destroy the unit |

Only **ready units** can block.
Exhausted units cannot block.

---

# 🧱 UNIT REFERENCE

---

### 🟡 Miner

**Cost:** 2 Gold  
**Stats:** 0 ATK / 1 BLK / 1 HP

**Ability — Mine (Exhaust):**  
Spend **1 Energy → Gain 1 Gold**

Your main economic engine.

---

### 🔵 Energizer

**Cost:** 2 Gold  
**Stats:** 0 ATK / 0 BLK / 3 HP

**Ability — Generate (Exhaust):**  
Gain **+1 Energy**

Your energy engine.

---

### 🔴 Striker

**Cost:** 3 Gold  
**Stats:** 2 ATK / 0 BLK / 1 HP  
**Attack Cost:** 1 Energy

Cheap, fragile attacker. Requires energy to swing.

---

### 🛡️ Guard

**Cost:** 3 Gold  
**Stats:** 1 ATK / 2 BLK / 2 HP

Basic defensive unit.

---

### 🧱 Wall

**Cost:** 3 Gold  
**Stats:** 0 ATK / 2 BLK / 0 HP (Limit 3 per player)

**Special:** Walls do NOT ready automatically at the start of your turn.
If used to block, the Wall becomes exhausted. To use it again, you must **Repair** it during your Action Phase.

**Ability — Repair (Exhausted, 1 Energy):**  
Ready this Wall so it can block again next turn.

---

### ⚡ Overcharger

**Cost:** 3 Gold + 1 Energy  
**Stats:** 1 ATK / 1 BLK / 3 HP

**Ability — Overcharge (Exhaust, 1 Energy):**  
Ready another unit.

Allows double use of key units.

---

### 💥 Volatile

**Cost:** 4 Gold + 2 Energy  
**Stats:** 0 ATK / 0 BLK / 2 HP

**Ability — Detonate (Exhaust, 1 Energy):**  
Destroy this unit → it gains **+5 Attack** this turn and is automatically added to your attackers.

Massive burst finisher. Note that this unit will be removed at the end of the turn it detonates.

---

### 🪵 Barrier

**Cost:** 1 Gold  
**Stats:** 0 ATK / 1 BLK / 1 HP

**Trait — Fragile:** If this unit is used to block, it is destroyed at the end of the turn.

Cheap disposable blocker.

---

## 🧠 Strategy Tips

* Early game is about balancing **Miner vs Energizer**
* Too much economy = you die to Strikers
* Too much defense = opponent outscales you
* Overcharger creates explosive turns
* Volatile punishes greedy opponents

---

## 💻 Digital Command Reference

| Command | Example | Effect |
| --- | --- | --- |
| `buy <unit>` | `buy miner` | Purchase a unit (Limit 1/turn) |
| `use <unit> [count]`| `use e`, `use e 2` | Activate unit ability (finds ready units) |
| `use <u1> on <u2>` | `use o on m` | Target another unit (Overcharger) |
| `attack <unit> [#]` | `attack s` | Prepare units for combat |
| `block <unit> [#]` | `block b` | Add blockers (Defense phase, cumulative) |
| `block clear` | `block clear` | Reset assigned blockers |
| `block end` | `block end` | Finish blocking & allow attacker damage |
| `assign <target>` | `assign base 2`, `assign m 2` | Assign damage (Auto destroys units) |
| `state` | `state` | Show full game board |
| `end` | `end` | Progress to next phase |

*Shortcuts: You can use the first letter of any unit (e.g., `buy m` for Miner).*

---

## 📝 Design Notes

This version is designed for pure strategy with **zero RNG**. Every win is earned through superior timing and resource allocation.
