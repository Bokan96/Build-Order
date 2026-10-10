// Two-peer online play-test over the PeerJS cloud, comparing engine state after every move.
// Also covers 0.8.6: harvest sync, block all / clear sync, empty-block auto-skip, rematch handshake.
const { launch, sleep } = require('../cdp.js');
const BASE = process.env.BASE || 'http://127.0.0.1:8001/web/';
let failures = 0;
const check = (cond, label) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures++; };
const SNAP = `(() => { const a = window.gameApp; return a.pyodide.runPython(${JSON.stringify(["import json", "_b = get_ui_bundle()", "for _side in ('p1', 'p2'):", "    for _u in _b[_side]['units']:", "        _u.pop('id', None)", "json.dumps(_b, sort_keys=True)"].join('\n'))}); })()`;
// injected units fly in and shine; wait for that to finish before clicking them
const settle = async (b) => { await b.waitFor('!document.querySelector(".fly-card") && !document.querySelector(".unit-shine")', 6000, 100); await sleep(300); };
const py = (b, lines) => b.eval(`(() => { const a = window.gameApp; a.pyodide.runPython(${JSON.stringify(lines.join('\n'))}); a.syncState(); a.updateUI(); return 1; })()`).then(async v => { await settle(b); return v; });

(async () => {
    const basePort = parseInt(process.env.CDP_PORT, 10) || 9460;
    const host = await launch({ port: basePort });
    const guest = await launch({ port: basePort + 1 });
    const both = [host, guest];
    const idle = (b) => b.waitFor('window.gameApp.state && !window.gameApp.isTurnTransitioning && !window.gameApp.processingTurn', 30000).then(() => sleep(300));
    const same = async (label) => {
        await sleep(900);
        const [h, g] = [await host.eval(SNAP), await guest.eval(SNAP)];
        const ok = h === g && typeof h === 'string';
        check(ok, `in sync: ${label}`);
        if (!ok) { console.log('    host :', h); console.log('    guest:', g); }
        return JSON.parse(h);
    };
    const tap = async (b, sel) => { const ok = await b.click(sel); await sleep(500); return ok; };
    const buy = async (b, id) => { await tap(b, '#btn-buy'); await sleep(300); await tap(b, `.shop-list-item[data-unit-id="${id}"]`); await sleep(600); };
    const endTurn = async (b) => { await tap(b, '#btn-end'); if (await b.eval('gameApp.endTurnArmed')) await tap(b, '#btn-end'); };
    try {
        for (const [b, name] of [[host, 'Hosty'], [guest, 'Guesty']]) {
            await b.goto(BASE);
            await b.waitFor('window.gameApp && window.gameApp.isLoaded', 90000);
            await sleep(1000);
            await b.eval(`document.getElementById('btn-tutorial-no')?.click(); document.getElementById('player-name-input').value = '${name}'; document.getElementById('btn-online').click(); true`);
        }
        await sleep(500);
        await host.eval(`document.getElementById('btn-create-room').click(); true`);
        const code = await host.waitFor(`(() => { const t = document.getElementById('room-code-text').textContent; return /^[A-Z]{3}$/.test(t) ? t : false; })()`, 30000);
        console.log('  room code:', code);
        check(!!code, 'host created a room');
        await guest.eval(`document.getElementById('btn-join-room').click(); document.getElementById('join-code-input').value = '${code}'; document.getElementById('btn-connect').click(); true`);
        const started = await host.waitFor(`window.gameApp.gameMode === 'ONLINE' && window.gameApp.state && !document.getElementById('app').classList.contains('hidden')`, 40000)
            && await guest.waitFor(`window.gameApp.gameMode === 'ONLINE' && window.gameApp.state && !document.getElementById('app').classList.contains('hidden')`, 40000);
        check(!!started, 'both peers entered the online game');
        for (const b of both) { await b.waitFor('window.gameApp.isTurnTransitioning', 6000); await b.waitFor('!window.gameApp.isTurnTransitioning', 10000); }
        await sleep(500);
        let s = await same('game start');
        check(s.p1.name === 'Hosty' && s.p2.name === 'Guesty', `names agree (${s.p1.name} vs ${s.p2.name})`);

        // T1 host: harvest (energizer + miner), buy striker
        await tap(host, '#btn-harvest');
        s = await same('host harvest');
        check(s.p1.gold === 3 && s.p1.energy === 0, 'harvest synced to guest');
        await buy(host, 'striker');
        s = await same('host striker buy');
        check(s.p1.units.some(u => u.type === 'striker'), 'host owns a striker');
        await guest.eval(`window.gameApp.multiplayer.sendAction({ type: 'endTurn' }); window.gameApp.multiplayer.sendAction({ type: 'buy', unitType: 'x")\\nimport js\\njs.window.pwned = 1\\n#' }); true`);
        await sleep(1200);
        s = await host.eval(SNAP).then(JSON.parse);
        check(s.turn === 1 && s.currentIsP1 && await host.eval('window.pwned === undefined'), 'host ignored out-of-turn / injected actions');
        await endTurn(host); await idle(guest);
        s = await same('host end turn');
        check(s.turn === 2 && !s.currentIsP1, 'guest has the turn');

        // T2 guest: harvest, striker, end
        await tap(guest, '#btn-harvest'); await buy(guest, 'striker');
        await same('guest harvest + buy');
        await endTurn(guest); await idle(host);
        await same('guest end turn');

        // T3 host: energize, prepare, undo, prepare again, end -> guest Block with block all / clear
        await tap(host, '#p1-units-energizer-col .unit-card.interactive');
        await tap(host, '#p1-units-striker-col .unit-card.interactive');
        s = await same('host prepared striker'); check(s.p1.atk === 2, 'striker prepared on both');
        await tap(host, '#p1-units-striker-col .unit-card.interactive');
        s = await same('host undid prepare'); check(s.p1.atk === 0 && s.p1.energy === 1, 'undo synced');
        await tap(host, '#p1-units-striker-col .unit-card.interactive');
        await endTurn(host); await idle(guest);
        s = await same('guest block phase'); check(s.phase === 'Block', 'guest is blocking');
        await tap(guest, '#btn-block-all'); await sleep(500);
        s = await same('guest block all'); check(s.combat.blk >= 2 && !s.p2.units.some(u => u.type === 'barrier' && u.isAlive), 'block all synced (barrier used)');
        await tap(guest, '#btn-block-clear'); await sleep(500);
        s = await same('guest clear blocks'); check(s.combat.blk === 0 && s.p2.units.some(u => u.type === 'barrier' && u.isAlive), 'clear synced (barrier restored)');
        await tap(guest, '#p2-units-barrier-col .unit-card.interactive'); await sleep(700);
        await tap(guest, '#btn-end'); await sleep(1500);
        s = await same('guest finished blocking (full block)');
        check(s.phase === 'Action' && !s.currentIsP1, 'guest in action after full block');
        await tap(guest, '#p2-units-energizer-col .unit-card.interactive');
        await tap(guest, '#p2-units-striker-col .unit-card.interactive');
        s = await same('guest prepared striker');

        // T4: host has every unit tapped -> empty block phase auto-skips on the host only
        await py(host, ["for u in game.player1.units:", "    u.exhausted = True"]);
        await py(guest, ["for u in game.player1.units:", "    u.exhausted = True"]);
        await endTurn(guest);
        const skipped = await guest.waitFor(`gameApp.state.phase === 'Breach'`, 10000);
        await idle(host);
        s = await same('host empty block auto-skipped');
        check(!!skipped && s.phase === 'Breach', 'auto-skip happened once and both peers are in Breach');
        await tap(guest, '#p1-units-miner-col'); await sleep(1200);
        await same('guest destroyed host miner');
        await tap(guest, '#btn-end'); await sleep(1500); await idle(host);
        s = await same('after breach');
        check(s.phase === 'Action' && s.currentIsP1 && s.p1.hp === 9, `host lost miner and 1 HP (hp=${s.p1.hp})`);

        // Rematch handshake: force a win for host, both click PLAY AGAIN
        for (const b of both) await py(b, ["game.player2.base_health = 1", "game.player1.energy = 1", "for u in game.player2.units:", "    u.exhausted = True"]);
        await py(host, ["x = [u for u in game.player1.units if u.name == 'Striker'][0]", "x.exhausted = False"]);
        await py(guest, ["x = [u for u in game.player1.units if u.name == 'Striker'][0]", "x.exhausted = False"]);
        await tap(host, '#p1-units-striker-col .unit-card.interactive:not(.exhausted)');
        await endTurn(host);
        await host.waitFor(`gameApp.state.phase === 'Breach' && !gameApp.processingTurn && !gameApp.isTurnTransitioning`, 15000); await sleep(400);
        console.log('  pre-attack host:', JSON.stringify(await host.state()));
        await tap(host, '#btn-end');
        const over = await host.waitFor('gameApp.state.gameOver', 8000) && await guest.waitFor('gameApp.state.gameOver', 8000);
        console.log('  post-attack host:', JSON.stringify(await host.state()), 'guest:', JSON.stringify(await guest.state()));
        check(!!over, 'game over on both peers');
        await tap(host, '#btn-endgame-rematch'); await sleep(800);
        const waiting = await host.eval(`document.getElementById('btn-endgame-rematch').textContent`);
        const gReady = await guest.eval(`document.getElementById('btn-endgame-rematch').textContent`);
        check(/WAITING/.test(waiting) && /opponent is ready/.test(gReady), `rematch handshake shown (${waiting} | ${gReady})`);
        await tap(guest, '#btn-endgame-rematch'); await sleep(2500);
        s = await same('rematch');
        check(s.turn === 1 && s.p1.hp === 10 && s.p2.hp === 10 && await host.eval(`document.getElementById('endgame-modal').classList.contains('hidden')`), 'both peers restarted together');
    } catch (e) { console.error('SCRIPT ERR', e); failures++; }
    for (const [b, n] of [[host, 'host'], [guest, 'guest']]) {
        const errs = b.logs.filter(l => !/favicon|Ignoring invalid/.test(l));
        if (errs.length) console.log(`  ${n} console:\n    ` + errs.join('\n    '));
    }
    console.log(`== online: ${failures ? failures + ' FAILED' : 'all passed'} ==`);
    both.forEach(b => b.close()); process.exit(failures ? 1 : 0);
})();
