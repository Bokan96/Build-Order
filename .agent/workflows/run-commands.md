---
description: Run a sequence of game commands in Prismata Lite
---

This workflow allows you to execute a list of commands in the game and see the final state.


// turbo-all
1. Create a temporary file `commands.txt` with each game command on a new line.
2. Run the game with the commands:
   `Get-Content commands.txt | python main.py`
3. Review the output.
