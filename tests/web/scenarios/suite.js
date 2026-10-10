// Gameplay regression scenarios. Usage: node t_suite.js <scenario> [port]
const { launch, sleep } = require('../cdp.js');
const BASE = process.env.BASE || 'http://127.0.0.1:8001/web/';
const scenario = process.argv[2];
const port = parseInt(process.env.CDP_PORT || process.argv[3] || '9400', 10);
let failures = 0;
const check = (cond, label) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures++; };

async function boot(b, { name } = {}) {
    await b.goto(BASE);
    await b.waitFor('window.gameApp && window.gameApp.isLoaded', 90000);
    if (name !== undefined) await b.eval(`localStorage.setItem('playerName', ${JSON.stringify(name)}); document.getElementById('player-name-input').value = ${JSON.stringify(name)}; true`);
    await sleep(1200);
    await b.eval(`document.getElementById('btn-tutorial-no')?.click(); true`);
}
const startGame = async (b, mode) => {
    if (mode === 'ai') await b.eval(`document.getElementById('btn-pve').click(); setTimeout(() => document.querySelector('.ai-choice[data-ai="Standard"]').click(), 400); true`);
    else await b.eval(`document.getElementById('btn-pvp').click(); true`);
    await b.waitFor('window.gameApp.state && window.gameApp.isTurnTransitioning', 10000);
    await b.waitFor('!window.gameApp.isTurnTransitioning', 10000); await sleep(400);
};
const idle = (b, t = 60000) => b.waitFor('window.gameApp && window.gameApp.state && !window.gameApp.isTurnTransitioning && !window.gameApp.processingTurn', t).then(async v => { await sleep(300); return v; });
const idleP1 = (b, t = 90000) => b.waitFor('window.gameApp.state && !window.gameApp.isTurnTransitioning && !window.gameApp.processingTurn && window.gameApp.state.currentIsP1', t).then(async v => { await sleep(300); return v; });
const S = async (b, label) => { const s = await b.state(); console.log('   ' + label.padEnd(24), JSON.stringify(s)); return s; };
const buy = async (b, id) => {
    await b.click('#btn-buy'); await sleep(600);
    const ok = await b.eval(`(() => { const el = document.querySelector('.shop-list-item[data-unit-id="${id}"]'); return !!el && !el.classList.contains('disabled'); })()`);
    if (ok) { await b.click(`.shop-list-item[data-unit-id="${id}"]`); await sleep(900); } else { await b.click('#shop-modal .close-btn'); await sleep(400); }
    return ok;
};
// injected units fly in and shine; wait for that to finish before clicking them
const settle = async (b) => { await b.waitFor('!document.querySelector(".fly-card") && !document.querySelector(".unit-shine")', 6000, 100); await sleep(300); };
const py = (b, code) => b.eval(`(() => { const a = window.gameApp; a.pyodide.runPython(${JSON.stringify(code)}); a.syncState(); a.updateUI(); return 'ok'; })()`).then(async v => { await settle(b); return v; });
// END TURN may ask for confirmation when energy/energizers are unspent: click until the turn actually ends
const endTurn = async (b) => { await b.click('#btn-end'); await sleep(250); if (await b.eval('gameApp.endTurnArmed')) await b.click('#btn-end'); };

const scenarios = {
    async hotseat(b) {
        await boot(b); await startGame(b, 'hotseat');
        await b.click('#p1-units-energizer-col .unit-card.interactive'); await sleep(400);
        await b.click('#p1-units-miner-col .unit-card.interactive'); await sleep(400);
        check(await buy(b, 'striker'), 'P1 bought Striker');
        await endTurn(b); await idle(b);
        await endTurn(b); await idle(b);
        await b.click('#p1-units-energizer-col .unit-card.interactive'); await sleep(400);
        await b.click('#p1-units-striker-col .unit-card.interactive'); await sleep(700);
        let s = await S(b, 'striker prepped');
        check(s.p1.energy === 0 && s.p1.atk === 2, 'striker prepared, energy 0');
        await b.click('#p1-units-striker-col .unit-card.interactive'); await sleep(700);
        s = await S(b, 'after undo');
        check(s.p1.energy === 1 && s.p1.atk === 0, 'undo at 0 energy refunded the energy');
        await b.click('#p1-units-striker-col .unit-card.interactive'); await sleep(700);
        await endTurn(b); await idle(b);
        s = await S(b, 'P2 block phase');
        check(s.phase === 'Block', 'P2 is in Block phase');
        await b.click('#p2-units-barrier-col .unit-card.interactive'); await sleep(1200);
        await b.click('#btn-end'); await sleep(2500);
        s = await S(b, 'after full block');
        check(s.phase === 'Action' && !s.lock && !s.proc && !/lockout/.test(s.body), 'no lock after full block');
        await b.click('#p2-units-energizer-col .unit-card.interactive'); await sleep(600);
        s = await S(b, 'P2 taps energizer');
        check(s.p2.energy === 1, 'P2 can still act after blocking');
        await endTurn(b); await idle(b);
        s = await S(b, 'END TURN works');
        check(s.turn === 5 && s.phase === 'Action', 'turn passed to P1 (turn 5)');
    },
    async aiattack(b) {
        await boot(b); await startGame(b, 'ai');
        await b.eval(`window.gameApp.aiSpeed = '2'; true`);
        let attacksSeen = 0;
        for (let t = 0; t < 30 && attacksSeen < 2; t++) {
            let s = await b.state();
            if (s.phase === 'Block') {
                attacksSeen++;
                if (attacksSeen === 1) { await b.click('#p1-units-wall-col .unit-card.interactive'); await sleep(600); }
                s = await S(b, `attack #${attacksSeen} block phase`);
                await b.click('#btn-end'); await sleep(2500);
                await b.waitFor('!window.gameApp.processingTurn', 20000); await sleep(500);
                s = await S(b, `after FINISH BLOCKING #${attacksSeen}`);
                check(s.phase === 'Action' && !s.lock && !s.proc && !/lockout/.test(s.body), `attack #${attacksSeen}: unlocked after blocking`);
                const before = s.turn;
                await endTurn(b); await sleep(1500);
                const ok = await idleP1(b);
                s = await S(b, 'after END TURN');
                check(ok && s.turn > before, `attack #${attacksSeen}: END TURN worked, game continues`);
                continue;
            }
            if (s.phase === 'Breach') { await b.click('#btn-end'); await idleP1(b); continue; }
            for (const type of ['energizer', 'miner']) for (let i = 0; i < 4; i++) { const has = await b.eval(`!!document.querySelector('#p1-units-${type}-col .unit-card.interactive:not(.exhausted)')`); if (!has) break; await b.click(`#p1-units-${type}-col .unit-card.interactive:not(.exhausted)`); await sleep(300); }
            s = await b.state();
            await buy(b, s.p1.gold >= 3 && !/Wal/.test(s.p1.units) ? 'wall' : 'energizer');
            await endTurn(b); await idleP1(b);
        }
        check(attacksSeen >= 1, `AI attacked at least once (seen ${attacksSeen})`);
    },
    async victory(b) {
        await boot(b); await startGame(b, 'ai');
        await b.eval(`(() => { const a = window.gameApp; a.aiSpeed='2'; a._victoryCount = 0; const orig = a.sounds.play.bind(a.sounds); a.sounds.play = (n) => { if (n==='VICTORY') a._victoryCount++; return orig(n); }; return true; })()`);
        await py(b, ["from prismata.units import create_unit", "for i in range(3):", "    s = create_unit('striker')", "    s.exhausted = False", "    game.player1.units.append(s)", "game.player1.energy = 3", "game.player2.base_health = 3"].join('\n'));
        for (let i = 0; i < 3; i++) { await b.click('#p1-units-striker-col .unit-card.interactive:not(.exhausted)'); await sleep(400); }
        await endTurn(b);
        await b.waitFor(`window.gameApp.state.phase === 'Breach' && !window.gameApp.processingTurn && !window.gameApp.isTurnTransitioning`, 40000); await sleep(500);
        let s = await S(b, 'breach');
        check(s.phase === 'Breach', 'reached Breach');
        await b.click('#btn-end'); await sleep(1500);
        const logLen = await b.eval(`document.querySelectorAll('#combat-log .log-entry').length`);
        await sleep(12000);
        s = await S(b, '+12s after win');
        const after = await b.eval(`Array.from(document.querySelectorAll('#combat-log .log-entry')).slice(${logLen}).map(e => e.textContent)`);
        check(await b.eval('window.gameApp._victoryCount') === 1, 'VICTORY played exactly once');
        check(await b.eval(`!document.getElementById('endgame-modal').classList.contains('hidden')`), 'endgame modal visible');
        check(!after.some(l => /AI Opponent is thinking|🤖 AI/.test(l)), `AI did not act after the win (${JSON.stringify(after)})`);
        check(s.p2.hp <= 0, 'AI base at 0');
    },
    async restart(b) {
        await boot(b); await startGame(b, 'ai');
        await endTurn(b); await sleep(1500);
        let s = await S(b, 'AI thinking');
        check(s.proc === true, 'AI turn in progress');
        await b.eval(`document.getElementById('btn-restart-game').click(); true`);
        await sleep(500);
        const logLen = await b.eval(`document.querySelectorAll('#combat-log .log-entry').length`);
        await sleep(12000);
        s = await S(b, '+12s after restart');
        const after = await b.eval(`Array.from(document.querySelectorAll('#combat-log .log-entry')).slice(${logLen}).map(e => e.textContent)`);
        check(s.turn === 1 && s.phase === 'Action' && s.p2.units === 'Min Ene Bar' && s.p2.gold === 2, 'new game untouched by old AI turn');
        check(!after.some(l => /🤖 AI|AI Actions/.test(l)), `no stale AI log lines (${JSON.stringify(after)})`);
        check(!s.proc && !s.lock, 'input not locked after restart');
        await b.click('#p1-units-energizer-col .unit-card.interactive'); await sleep(500);
        s = await S(b, 'P1 acts');
        check(s.p1.energy === 1, 'P1 can act in the new game');
    },
    async names(b) {
        await boot(b, { name: 'Player 2' }); await startGame(b, 'hotseat');
        let s = await S(b, 'duplicate names T1');
        check((await b.eval('window.gameApp.state.p1.name')) === (await b.eval('window.gameApp.state.p2.name')), 'both seats named "Player 2"');
        await b.click('#p1-units-energizer-col .unit-card.interactive'); await sleep(400);
        s = await S(b, 'P1 acts');
        check(s.p1.energy === 1, 'P1 side is interactive');
        await endTurn(b); await idle(b);
        s = await S(b, 'P2 turn');
        check(!(await b.eval('window.gameApp.state.currentIsP1')) && s.turn === 2, 'turn switched to seat 2');
        await b.click('#p2-units-energizer-col .unit-card.interactive'); await sleep(400);
        s = await S(b, 'P2 acts');
        check(s.p2.energy === 1, 'P2 side is interactive despite identical names');
        await b.eval(`document.getElementById('player-name-input').value = 'Bo"ki\\')'; window.gameApp.gameMode = 'HOTSEAT'; window.gameApp.resetGame(); true`);
        await sleep(800);
        const n = await b.eval('window.gameApp.state && window.gameApp.state.p1.name');
        check(n === 'Bo"ki\')', `quoted name survives setup (${n})`);
    },
};

(async () => {
    const b = await launch({ port });
    try {
        console.log(`== ${scenario} ==`);
        await scenarios[scenario](b);
    } catch (e) { console.error('SCRIPT ERR', e); failures++; }
    const errs = b.logs.filter(l => !/favicon/.test(l));
    if (errs.length) console.log('  console errors:\n    ' + errs.join('\n    '));
    console.log(`== ${scenario}: ${failures ? failures + ' FAILED' : 'all passed'} ==`);
    b.close(); process.exit(failures ? 1 : 0);
})();
