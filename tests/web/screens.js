// Screenshots of the main screens for visual review -> tests/web/shots/
//   node tests/web/screens.js            (starts its own local server)
//   BASE=<url> node tests/web/screens.js
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const { launch, sleep } = require('./cdp.js');

const ROOT = path.resolve(__dirname, '..', '..');
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const py = (b, lines) => b.eval(`(() => { const a = window.gameApp; a.pyodide.runPython(${JSON.stringify(lines.join('\n'))}); a.syncState(); a.updateUI(); return 1; })()`).then(() => sleep(1500));
const idle = (b) => sleep(500).then(() => b.waitFor('!window.gameApp.isTurnTransitioning && !window.gameApp.processingTurn', 30000)).then(() => sleep(400));
const endTurn = async (b) => { await b.click('#btn-end'); await sleep(250); if (await b.eval('gameApp.endTurnArmed')) await b.click('#btn-end'); };

async function capture(base, tag, opts) {
    const b = await launch({ port: 9900 + (tag.length % 7), ...opts });
    try {
        await b.goto(base);
        await b.waitFor('window.gameApp && window.gameApp.isLoaded', 90000);
        await b.eval(`window.gameApp._applyUIScale(1.0); true`);
        await sleep(1200);
        await b.shot(`${tag}_1_menu`);
        await b.eval(`document.getElementById('btn-tutorial-no')?.click(); document.getElementById('btn-pvp').click(); true`);
        await b.waitFor('window.gameApp.state && window.gameApp.isTurnTransitioning', 10000);
        await b.waitFor('!window.gameApp.isTurnTransitioning', 10000); await sleep(400);
        await py(b, [
            "from prismata.units import create_unit",
            "def add(p, t, n, ready=True):",
            "    for _ in range(n):",
            "        u = create_unit(t); u.exhausted = not ready; p.units.append(u)",
            "add(game.player1, 'miner', 2); add(game.player1, 'striker', 2); add(game.player1, 'guard', 1); add(game.player1, 'wall', 1)",
            "add(game.player2, 'energizer', 1); add(game.player2, 'guard', 1); add(game.player2, 'wall', 1); add(game.player2, 'volatile', 1)",
            "game.player1.gold = 7; game.player1.energy = 2",
        ]);
        await b.shot(`${tag}_2_board`);
        for (let i = 0; i < 2; i++) { await b.click('#p1-units-striker-col .unit-card.interactive:not(.exhausted)'); await sleep(300); }
        await b.click('#btn-harvest'); await sleep(900);
        await b.shot(`${tag}_3_tapped`);
        await b.eval(`document.getElementById('btn-buy').click(); true`); await sleep(800);
        await b.shot(`${tag}_4_shop`);
        await b.eval(`window.gameApp.hideShop(); true`); await sleep(400);
        await endTurn(b); await idle(b);
        await b.shot(`${tag}_5_block`);
        await b.click('#p2-units-guard-col .unit-card.interactive'); await sleep(500);
        await b.click('#btn-end'); await sleep(1800);
        await b.shot(`${tag}_6_breach`);
        await b.click('#btn-end'); await idle(b);
        await py(b, ["game.player1.base_health = 1", "game.player2.energy = 1", "for u in game.player1.units:", "    u.exhausted = True"]);
        await b.click('#p2-units-volatile-col .unit-card.interactive:not(.exhausted)'); await sleep(400);
        await endTurn(b);
        await b.waitFor(`gameApp.state.phase === 'Breach' && !gameApp.processingTurn && !gameApp.isTurnTransitioning`, 15000); await sleep(300);
        await b.click('#btn-end'); await sleep(1800);
        await b.shot(`${tag}_7_end`);
    } catch (e) { console.error(tag, 'ERR', e); }
    b.close();
}

(async () => {
    let server = null, base = process.env.BASE;
    if (!base) {
        const port = await freePort();
        server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), ROOT, String(port)], { stdio: 'ignore' });
        base = `http://127.0.0.1:${port}/web/`;
        await sleep(800);
    }
    await Promise.all([
        capture(base, 'desktop', { width: 1920, height: 1080 }),
        capture(base, 'phone', { width: 390, height: 844, mobile: true }),
        capture(base, 'landscape', { width: 844, height: 390, mobile: true }),
    ]);
    if (server) server.kill();
    console.log('Screenshots written to tests/web/shots/');
    process.exit(0);
})();
