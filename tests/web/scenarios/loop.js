// 0.8.6 checks: single click sound, tight stacks, harvest, end-turn confirm, previews, block all/clear,
// empty-block auto-skip, settle pause, tilt, embers, end screen + rematch
const { launch, sleep } = require('../cdp.js');
const BASE = process.env.BASE || 'http://127.0.0.1:8001/web/';
const which = process.argv[2] || 'hotseat';
let failures = 0;
const check = (cond, label) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures++; };
// injected units fly in and shine; wait for that to finish before clicking them
const settle = async (b) => { await b.waitFor('!document.querySelector(".fly-card") && !document.querySelector(".unit-shine")', 6000, 100); await sleep(300); };
const py = (b, lines) => b.eval(`(() => { const a = window.gameApp; a.pyodide.runPython(${JSON.stringify(lines.join('\n'))}); a.syncState(); a.updateUI(); return 1; })()`).then(async v => { await settle(b); return v; });
const idle = (b) => sleep(500).then(() => b.waitFor('!window.gameApp.isTurnTransitioning && !window.gameApp.processingTurn', 60000)).then(() => sleep(300));
async function boot(b, mode) {
    await b.goto(BASE);
    await b.waitFor('window.gameApp && window.gameApp.isLoaded', 90000);
    await b.eval(`window.gameApp._applyUIScale(1.0); window._plays = []; const o = window.gameApp.sounds.play.bind(window.gameApp.sounds); window.gameApp.sounds.play = n => { window._plays.push(n); return o(n); }; true`);
    await sleep(1200);
    await b.eval(`document.getElementById('btn-tutorial-no')?.click(); true`);
    if (mode === 'ai') await b.eval(`document.getElementById('btn-pve').click(); setTimeout(() => document.querySelector('.ai-choice[data-ai="Standard"]').click(), 400); true`);
    else await b.eval(`document.getElementById('btn-pvp').click(); true`);
    await b.waitFor('window.gameApp.state && window.gameApp.isTurnTransitioning', 10000);
    await b.waitFor('!window.gameApp.isTurnTransitioning', 10000);
    await sleep(400);
}
const plays = (b) => b.eval(`(() => { const p = window._plays.slice(); window._plays = []; return p; })()`);
const endTurn = async (b) => { await b.click('#btn-end'); await sleep(250); if (await b.eval('gameApp.endTurnArmed')) await b.click('#btn-end'); };
const st = (b) => b.eval(`({ phase: gameApp.state.phase, turn: gameApp.state.turn, p1: { e: gameApp.state.p1.energy, g: gameApp.state.p1.gold, hp: gameApp.state.p1.hp }, p2: { e: gameApp.state.p2.energy, g: gameApp.state.p2.gold, hp: gameApp.state.p2.hp }, btn: document.getElementById('btn-end').textContent, armed: gameApp.endTurnArmed, hint: document.getElementById('turn-hint').textContent, harvest: !document.getElementById('btn-harvest').classList.contains('hidden'), blockAll: !document.getElementById('btn-block-all').classList.contains('hidden'), clear: !document.getElementById('btn-block-clear').classList.contains('hidden'), pending: document.querySelector('.game-board').classList.contains('attack-pending') })`);

(async () => {
    const b = await launch({ port: parseInt(process.env.CDP_PORT, 10) || (which === 'ai' ? 9800 : 9801), width: 1920, height: 1080 });
    try {
        if (which === 'hotseat') {
            await boot(b, 'hotseat');
            // 1. One click sound per button press
            await plays(b);
            await b.click('#btn-settings'); await sleep(300);
            let p = await plays(b);
            check(p.filter(x => x === 'CLICK').length === 1, `settings button: one CLICK (${JSON.stringify(p)})`);
            await b.click('#close-settings'); await sleep(300);
            p = await plays(b);
            check(p.filter(x => x === 'CLICK').length === 1, `close button: one CLICK (${JSON.stringify(p)})`);

            // 2. Tight stacks
            await py(b, ["from prismata.units import create_unit", "for i in range(2):", "    m = create_unit('miner'); m.exhausted = False; game.player1.units.append(m)"]);
            await sleep(1500); // let the purchase shine (which scales the card) finish before measuring
            const strip = await b.eval(`(() => { const cs = Array.from(document.querySelectorAll('#p1-units-miner-col .unit-card')); const r0 = cs[0].getBoundingClientRect(), r1 = cs[1].getBoundingClientRect(); return { strip: Math.round(r1.top - r0.top), h: Math.round(r0.height), mt: getComputedStyle(cs[1]).marginTop, cardH: getComputedStyle(document.getElementById('p1-units')).getPropertyValue('--card-h') }; })()`);
            console.log('  stack:', JSON.stringify(strip));
            check(strip.strip >= 22 && strip.strip <= 34, 'buried card shows a ~28px strip');

            // 3. Harvest: energizer + miners as energy allows; buried used card still undoable
            let s = await st(b);
            check(s.harvest, 'HARVEST visible with ready economy');
            await b.click('#btn-harvest'); await sleep(600);
            s = await st(b);
            console.log('  after harvest:', JSON.stringify(s.p1), 'harvest visible:', s.harvest);
            check(s.p1.e === 0 && s.p1.g === 3 && !s.harvest, 'harvest tapped 1 energizer + 1 miner (energy 0, gold 3) and hid itself');
            const undone = await b.eval(`(() => { const cs = document.querySelectorAll('#p1-units-miner-col .unit-card.exhausted.interactive'); return cs.length; })()`);
            check(undone >= 1, 'used miner in the stack is undoable');

            // 4. End-turn safety: give energy, first click arms, second ends
            await py(b, ["game.player1.energy = 2"]);
            await b.click('#btn-end'); await sleep(300);
            s = await st(b);
            check(s.armed && /END ANYWAY\? · 2🔋 lost/.test(s.btn) && s.turn === 1, `first END TURN arms (${s.btn})`);
            await b.click('#btn-end'); await idle(b);
            s = await st(b);
            check(s.turn === 2 && !s.armed, 'second click ends the turn');
            // P2: nothing to lose (0 energy, but ready energizer -> should arm). Tap energizer+miner first, then no arm.
            await b.click('#p1-units-energizer-col .unit-card.interactive').catch(() => { });
            await b.click('#p2-units-energizer-col .unit-card.interactive'); await sleep(300);
            await b.click('#p2-units-miner-col .unit-card.interactive'); await sleep(300);
            await b.click('#btn-end'); await idle(b);
            s = await st(b);
            check(s.turn === 3, 'no confirm when nothing is wasted');

            // 5. Block phase: preview, block all / clear (Barrier restored), FINISH with preview
            await py(b, ["from prismata.units import create_unit", "for i in range(2):", "    x = create_unit('striker'); x.exhausted = False; game.player1.units.append(x)", "game.player1.energy = 2", "w = create_unit('wall'); game.player2.units.append(w)"]);
            for (let i = 0; i < 2; i++) { await b.click('#p1-units-striker-col .unit-card.interactive:not(.exhausted)'); await sleep(300); }
            s = await st(b);
            check(s.pending, 'seam pulses while an attack is prepared');
            await endTurn(b); await idle(b);
            s = await st(b);
            console.log('  block:', JSON.stringify({ hint: s.hint, blockAll: s.blockAll, clear: s.clear }));
            check(s.phase === 'Block' && /Incoming ⚔️4 → up to 4 reach you \(base 10 → 6\)/.test(s.hint), 'block hint previews damage');
            check(s.blockAll && !s.clear, 'BLOCK ALL shown, CLEAR hidden');
            await b.click('#btn-block-all'); await sleep(900);
            let blk = await b.eval(`({ blk: gameApp.state.combat.blk, blocking: gameApp.state.p2.units.filter(u => u.blocking).length, barrierAlive: gameApp.state.p2.units.some(u => u.type === 'barrier' && u.isAlive) })`);
            console.log('  after block all:', JSON.stringify(blk));
            check(blk.blocking === 2 && blk.blk === 4 && !blk.barrierAlive, 'block all used wall and barrier (the miner tapped last turn is not ready)');
            s = await st(b);
            check(!s.blockAll && s.clear, 'after blocking all: CLEAR shown, BLOCK ALL hidden');
            await b.click('#btn-block-clear'); await sleep(900);
            blk = await b.eval(`({ blk: gameApp.state.combat.blk, blocking: gameApp.state.p2.units.filter(u => u.blocking).length, barrierAlive: gameApp.state.p2.units.some(u => u.type === 'barrier' && u.isAlive), wallReady: gameApp.state.p2.units.some(u => u.type === 'wall' && !u.exhausted) })`);
            console.log('  after clear:', JSON.stringify(blk));
            check(blk.blocking === 0 && blk.blk === 0 && blk.barrierAlive && blk.wallReady, 'clear restores barrier and wall');
            await b.click('#p2-units-wall-col .unit-card.interactive'); await sleep(500);
            await b.click('#btn-end'); await sleep(1600);
            s = await st(b);
            check(s.phase === 'Breach' && /ATTACK BASE 2 ⚔️ → ❤️8/.test(s.btn), `breach button previews base HP (${s.btn})`);
            await b.click('#btn-end'); await idle(b);

            // 6. Auto-skip empty block: P2 attacks P1 who has no ready blockers
            s = await st(b);
            check(s.phase === 'Action' && s.p2.hp === 8, 'breach resolved (base 8)');
            await py(b, ["from prismata.units import create_unit", "x = create_unit('striker'); x.exhausted = False; game.player2.units.append(x)", "game.player2.energy = 1", "for u in game.player1.units:", "    u.exhausted = True"]);
            await b.click('#p2-units-striker-col .unit-card.interactive:not(.exhausted)'); await sleep(400);
            await endTurn(b);
            const skipped = await b.waitFor(`gameApp.state.phase === 'Breach' && !gameApp.processingTurn && !gameApp.isTurnTransitioning`, 10000);
            s = await st(b);
            check(!!skipped && s.phase === 'Breach', `empty block phase skipped straight to breach (${s.phase})`);
            const logged = await b.eval(`Array.from(document.querySelectorAll('#combat-log .log-entry')).some(e => e.textContent.includes('No blockers ready'))`);
            check(logged, 'skip is logged');
            await b.click('#btn-end'); await idle(b);

            // 7. Tilt on hover (desktop), none on exhausted
            const box = await b.eval(`(() => { const c = document.querySelector('#p1-units .unit-card:not(.exhausted)'); const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.8, y: r.top + r.height * 0.2 }; })()`);
            await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y }); await sleep(150);
            console.log('  canHover:', await b.eval('gameApp._canHover()'), 'under mouse:', await b.eval(`(() => { const el = document.elementFromPoint(${box.x}, ${box.y}); return el ? el.className : null; })()`));
            const tilt = await b.eval(`(() => { const c = document.querySelector('#p1-units .unit-card.tilt'); return c ? { tx: c.style.getPropertyValue('--tx'), ty: c.style.getPropertyValue('--ty'), tf: getComputedStyle(c).transform !== 'none' } : null; })()`);
            console.log('  tilt:', JSON.stringify(tilt));
            check(tilt && tilt.tf && parseFloat(tilt.ty) > 0 && parseFloat(tilt.tx) > 0, 'hovered card tilts toward the mouse');
            await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 500 }); await sleep(150);
            check(await b.eval(`!document.querySelector('.unit-card.tilt')`), 'tilt resets on leave');

            // 8. Embers drawing
            const embers = await b.eval(`(() => { const c = document.getElementById('bg-fx'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++; return { w: c.width, h: c.height, lit }; })()`);
            console.log('  embers:', JSON.stringify(embers));
            check(embers.w > 100 && embers.lit > 50, 'ember canvas sized to the board and drawing');

            // 9. End screen stats + rematch
            await py(b, ["game.player2.base_health = 1"]);
            await b.eval('gameApp._damageDealt.p1 -= 7; true'); // the injected HP drop isn't real damage
            await py(b, ["from prismata.units import create_unit", "x = create_unit('striker'); x.exhausted = False; game.player1.units.append(x)", "game.player1.energy = 1", "for u in game.player2.units:", "    u.exhausted = True"]);
            await b.click('#p1-units-striker-col .unit-card.interactive:not(.exhausted)'); await sleep(400);
            await endTurn(b);
            await b.waitFor(`gameApp.state.phase === 'Breach' && !gameApp.processingTurn && !gameApp.isTurnTransitioning`, 10000); await sleep(300);
            await b.click('#btn-end'); await sleep(1500);
            const eg = await b.eval(`({ visible: !document.getElementById('endgame-modal').classList.contains('hidden'), title: document.getElementById('endgame-title').textContent, p1dmg: document.getElementById('eg-p1-dmg').textContent, p2dmg: document.getElementById('eg-p2-dmg').textContent, p1kills: document.getElementById('eg-p1-kills').textContent, bought: document.getElementById('eg-p1-bought').textContent, crown: !!document.querySelector('.endgame-table th.winner') })`);
            console.log('  end screen:', JSON.stringify(eg));
            check(eg.visible && eg.title === 'PLAYER WINS' && eg.p1dmg === '4' && eg.p2dmg === '2' && eg.crown, 'end screen shows result and damage stats');
            await b.shot('e0_endscreen');
            await b.click('#btn-endgame-rematch'); await sleep(2500);
            s = await st(b);
            const modalHidden = await b.eval(`document.getElementById('endgame-modal').classList.contains('hidden')`);
            check(modalHidden && s.turn === 1 && s.p1.hp === 10 && s.p2.hp === 10, 'PLAY AGAIN starts a fresh game');
        }

        if (which === 'ai') {
            await boot(b, 'ai');
            // Settle pause: after ATTACK BASE, >=1.2s before "AI is thinking…"
            await py(b, ["from prismata.units import create_unit", "x = create_unit('striker'); x.exhausted = False; game.player1.units.append(x)", "game.player1.energy = 1"]);
            await b.click('#p1-units-striker-col .unit-card.interactive:not(.exhausted)'); await sleep(400);
            await b.eval(`window.gameApp.aiSpeed = '2'; true`);
            await endTurn(b);
            await b.waitFor(`gameApp.state.phase === 'Breach' && !gameApp.processingTurn`, 30000); await sleep(300);
            await b.click('#btn-end');
            const t0 = Date.now();
            await b.waitFor(`document.querySelector('#opponent-area .player-stats-bar').classList.contains('thinking')`, 10000, 20);
            const gap = Date.now() - t0;
            console.log('  ms from ATTACK BASE to thinking:', gap);
            check(gap >= 1100, 'AI waits for the hit to land before thinking');
            await b.waitFor('gameApp.state.currentIsP1 && !gameApp.processingTurn', 60000);
            // Hint during AI turn had no name; harvest hidden on AI turn handled by isMyTurn
            const s = await st(b);
            check(s.harvest, 'HARVEST back on my turn');
        }
        const errs = b.logs.filter(l => !/favicon/.test(l));
        if (errs.length) console.log('  console:\n    ' + errs.join('\n    '));
    } catch (e) { console.error('SCRIPT ERR', e); failures++; }
    b.close();
    console.log(`== loop ${which}: ${failures ? failures + ' FAILED' : 'all passed'} ==`);
    process.exit(failures ? 1 : 0);
})();
