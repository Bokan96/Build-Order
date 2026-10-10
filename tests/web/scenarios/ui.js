// Compact regression of earlier UI work: tap animation + untap wave + floats + reduced motion,
// hint/tracker/meter/pips/chips/popups/recap/fly-in/hit flash, mobile portrait + landscape layout.
const { launch, sleep } = require('../cdp.js');
const BASE = process.env.BASE || 'http://127.0.0.1:8001/web/';
const which = process.argv[2] || 'desktop';
let failures = 0;
const check = (cond, label) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures++; };
// injected units fly in and shine; wait for that to finish before clicking them
const settle = async (b) => { await b.waitFor('!document.querySelector(".fly-card") && !document.querySelector(".unit-shine")', 6000, 100); await sleep(300); };
const py = (b, lines) => b.eval(`(() => { const a = window.gameApp; a.pyodide.runPython(${JSON.stringify(lines.join('\n'))}); a.syncState(); a.updateUI(); return 1; })()`).then(async v => { await settle(b); return v; });
const idle = (b) => sleep(500).then(() => b.waitFor('!window.gameApp.isTurnTransitioning && !window.gameApp.processingTurn', 60000)).then(() => sleep(300));
const endTurn = async (b) => { await b.click('#btn-end'); await sleep(250); if (await b.eval('gameApp.endTurnArmed')) await b.click('#btn-end'); };
async function boot(b, mode, { reduce = false } = {}) {
    if (reduce) await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await b.goto(BASE);
    await b.waitFor('window.gameApp && window.gameApp.isLoaded', 90000);
    await b.eval(`window.gameApp._applyUIScale(1.0); true`);
    await sleep(1200);
    await b.eval(`document.getElementById('btn-tutorial-no')?.click(); true`);
    if (mode === 'ai') await b.eval(`document.getElementById('btn-pve').click(); setTimeout(() => document.querySelector('.ai-choice[data-ai="Standard"]').click(), 400); true`);
    else await b.eval(`document.getElementById('btn-pvp').click(); true`);
    await b.waitFor('window.gameApp.state && window.gameApp.isTurnTransitioning', 10000);
    await b.waitFor('!window.gameApp.isTurnTransitioning', 10000); await sleep(400);
}
const ui = (b) => b.eval(`(() => { const q = s => document.querySelector(s); const m = q('#central-attack-container'); return { hint: q('#turn-hint').textContent, step: (q('#phase-steps li.current') || {}).textContent || '', meter: Array.from(m.classList).filter(c => /^mode-|^toward-/.test(c)).join(' '), value: q('#central-atk').textContent, you: [!q('#p1-you').classList.contains('hidden'), !q('#p2-you').classList.contains('hidden')], pips: ['p1','p2'].map(p => [q('#'+p+'-hp-bar').children.length, q('#'+p+'-hp-bar').querySelectorAll('.lost').length]), stacks: Array.from(document.querySelectorAll('.stack-count')).map(e => e.textContent), floats: Array.from(document.querySelectorAll('.float-text')).map(f => f.textContent) }; })()`);

(async () => {
    const mobile = which === 'mobile', land = which === 'landscape';
    const b = await launch({ port: parseInt(process.env.CDP_PORT, 10) || (mobile ? 9602 : (land ? 9603 : 9600)), width: mobile ? 390 : (land ? 844 : 1920), height: mobile ? 844 : (land ? 390 : 1080), mobile: mobile || land });
    try {
        if (which === 'desktop') {
            await boot(b, 'ai');
            let s = await ui(b);
            check(/Tap units/.test(s.hint) && s.step === 'Action' && s.you[0] && !s.you[1] && s.pips[0][0] === 10, 'hint, tracker, YOU tag, pips at start');
            // Tap animation mid-flight + float
            await b.click('#p1-units-energizer-col .unit-card.interactive');
            const mid = await b.eval(`new Promise(r => setTimeout(() => { const c = document.querySelector('#p1-units-energizer-col .unit-card'); r({ rotate: getComputedStyle(c).rotate, floats: Array.from(document.querySelectorAll('.float-text')).map(f => f.textContent) }); }, 90))`);
            check(parseFloat(mid.rotate) > 5 && parseFloat(mid.rotate) < 88 && mid.floats.includes('+1🔋'), `tap animates (${mid.rotate}) and pops +1🔋`);
            await sleep(400);
            // Why-not popup, chip, stack count
            await py(b, ["from prismata.units import create_unit", "s = create_unit('striker'); s.exhausted = False; game.player1.units.append(s)", "for i in range(2):", "    m = create_unit('miner'); m.exhausted = False; game.player1.units.append(m)"]);
            await py(b, ["game.player1.energy = 0"]);
            await b.click('#p1-units-striker-col .unit-card.interactive'); await sleep(250);
            s = await ui(b);
            check(s.floats.includes('Needs 1🔋'), 'why-not popup');
            check(s.stacks.some(t => t.startsWith('×3')), `stack count (${JSON.stringify(s.stacks)})`);
            await py(b, ["game.player1.energy = 1"]);
            await b.click('#p1-units-striker-col .unit-card.interactive'); await sleep(400);
            s = await ui(b);
            check(/mode-attack/.test(s.meter) && /toward-p2/.test(s.meter) && s.value === '2', 'meter: attack 2 toward seat 2');
            // Fly-in on buy
            await py(b, ["game.player1.gold = 4"]);
            await b.click('#btn-buy'); await sleep(600);
            await b.click('.shop-list-item[data-unit-id="barrier"]');
            const ghost = await b.waitFor(`!!document.querySelector('.fly-card')`, 1500, 20);
            check(!!ghost, 'bought card flies in');
            await sleep(900);
            // AI turn: thinking dots, recap at my turn
            await b.eval(`window.gameApp.aiSpeed = '2'; true`);
            await endTurn(b);
            const thinking = await b.waitFor(`document.querySelector('#opponent-area .player-stats-bar').classList.contains('thinking')`, 15000, 50);
            check(!!thinking, 'AI thinking dots');
            await b.waitFor('window.gameApp.state.currentIsP1 && !window.gameApp.processingTurn', 60000);
            const recap = await b.waitFor(`(() => { const t = document.getElementById('recap-toast'); return t && t.classList.contains('visible') ? t.textContent : false; })()`, 5000, 50);
            check(typeof recap === 'string' && /^AI bought/.test(recap), `recap toast (${recap})`);
            // Block phase meter + hit flash on base damage (AI attack later is slow; simulate via hotseat below)
        }
        if (which === 'hotseat-combat') {
            await boot(b, 'hotseat');
            await py(b, ["from prismata.units import create_unit", "for i in range(2):", "    x = create_unit('striker'); x.exhausted = False; game.player1.units.append(x)", "game.player1.energy = 2"]);
            for (let i = 0; i < 2; i++) { await b.click('#p1-units-striker-col .unit-card.interactive:not(.exhausted)'); await sleep(300); }
            await endTurn(b); await idle(b);
            let s = await ui(b);
            check(s.step === 'Block' && /mode-incoming/.test(s.meter) && /toward-p2/.test(s.meter) && s.value === '4', 'block: tracker + incoming meter');
            await b.click('#p2-units-miner-col .unit-card.interactive'); await sleep(500);
            s = await ui(b);
            check(s.value === '3', 'meter counts blocks');
            await b.click('#btn-end'); await sleep(1800);
            s = await ui(b);
            check(s.step === 'Breach' && /mode-assign/.test(s.meter), 'breach: tracker + meter');
            await b.click('#p2-units-energizer-col'); await sleep(900);
            s = await ui(b);
            check(s.floats.includes('-2'), 'breach kill pops -2');
            await b.click('#btn-end');
            const hit = await b.waitFor(`document.querySelector('#opponent-area .player-stats-bar').classList.contains('hit') && !!document.querySelector('.hit-flash')`, 2000, 20);
            check(!!hit, 'base hit: shake + flash');
            await idle(b);
            s = await ui(b);
            check(s.pips[1][0] === 10 && s.pips[1][1] === 1, `seat 2 lost 1 pip (${JSON.stringify(s.pips[1])})`);
        }
        if (which === 'reduced') {
            await boot(b, 'hotseat', { reduce: true });
            await b.click('#p1-units-energizer-col .unit-card.interactive');
            const n = await b.eval(`new Promise(res => setTimeout(() => res(document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('unit-card')).length), 60))`);
            check(n === 0, `reduced motion: no card animations (${n})`);
            const embers = await b.eval(`(() => { const c = document.getElementById('bg-fx'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++; return lit; })()`);
            check(embers === 0, `reduced motion: embers off (${embers})`);
        }
        if (which === 'ai-breach') {
            // AI attacks, nothing can block: each target is highlighted before it is hit
            await boot(b, 'ai');
            await b.eval(`window.gameApp.aiSpeed = '1'; true`); // 600 ms target highlight
            await py(b, ["from prismata.units import create_unit", "for i in range(2):", "    x = create_unit('striker'); x.exhausted = False; game.player2.units.append(x)", "game.player2.gold = 0", "game.player2.energy = 2", "for u in game.player1.units:", "    u.exhausted = True"]);
            await b.eval(`window._ev = []; const t0 = performance.now(); new MutationObserver(ms => { for (const m of ms) { const el = m.target; if (!(el instanceof Element)) continue; const inP1 = !!el.closest('#p1-units'); const isPlate = el.matches('#player-area .player-stats-bar'); if (!inP1 && !isPlate) continue; const tag = isPlate ? 'plate' : (el.dataset.type || ''); if (el.classList.contains('ai-target')) window._ev.push(['target', tag, Math.round(performance.now() - t0)]); if (el.classList.contains('unit-destroy')) window._ev.push(['destroy', tag, Math.round(performance.now() - t0)]); } }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true }); true`);
            await endTurn(b);
            const done = await b.waitFor(`window.gameApp.state.currentIsP1 && window.gameApp.state.phase === 'Action' && !window.gameApp.processingTurn && window.gameApp.state.p1.hp < 10`, 120000);
            const ev = await b.eval('window._ev');
            const hintSeen = await b.eval(`Array.from(document.querySelectorAll('#combat-log .log-entry')).some(e => /AI targets your Miner/.test(e.textContent))`);
            console.log('  events:', JSON.stringify(ev));
            const i = (k, t) => ev.findIndex(e => e[0] === k && e[1] === t);
            check(!!done, 'breach resolved and P1 got the turn back');
            check(i('target', 'miner') >= 0 && i('destroy', 'miner') > i('target', 'miner'), 'Miner highlighted before being destroyed');
            check(i('target', 'miner') >= 0 && ev[i('destroy', 'miner')][2] - ev[i('target', 'miner')][2] >= 500, 'highlight lasts the target delay');
            check(i('target', 'plate') > i('destroy', 'miner'), 'base highlighted after the Miner, before the hit');
            check(hintSeen, 'targets are logged');
            const s = await ui(b);
            check(s.pips[0][1] === 1 && !(await b.eval(`window.gameApp.state.p1.units.some(u => u.type === 'miner' && u.isAlive)`)), 'Miner gone, base lost 1');
            await b.shot('ui_ai_breach_after');
        }
        if (which === 'menu') {
            // The main menu must fit common desktop sizes without cropping its buttons
            await b.goto(BASE);
            await b.waitFor('window.gameApp && window.gameApp.isLoaded', 90000);
            await sleep(1200);
            await b.eval(`document.getElementById('btn-tutorial-no')?.click(); true`);
            for (const [w, h, scale] of [[1366, 768, 0.85], [1280, 720, 1.0], [1536, 864, 1.0], [1920, 1080, 1.4]]) {
                await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
                await b.eval(`window.gameApp._applyUIScale(${scale}); true`);
                await sleep(400);
                const m = await b.eval(`(() => { const c = document.querySelector('#welcome-screen .menu-container').getBoundingClientRect(); const btn = document.getElementById('btn-how-to-play').getBoundingClientRect(); return { top: Math.round(c.top), bottom: Math.round(c.bottom), vh: innerHeight, lastBtnVisible: btn.bottom <= innerHeight && btn.top >= 0 }; })()`);
                console.log(`  ${w}x${h} @${scale}:`, JSON.stringify(m));
                check(m.top >= 0 && m.bottom <= m.vh && m.lastBtnVisible, `menu fits ${w}x${h} at scale ${scale}`);
                if (w === 1366) await b.shot('ui_menu_1366x768');
            }
        }
        if (mobile || land) {
            await boot(b, 'hotseat');
            await py(b, ["from prismata.units import create_unit", "for t in ['striker', 'guard', 'wall']:", "    u = create_unit(t); u.exhausted = False; game.player1.units.append(u)", "game.player1.gold = 6"]);
            const m = await b.eval(`(() => { const vw = innerWidth, vh = innerHeight; const tops = Array.from(document.querySelectorAll('#p1-units .unit-column')).map(c => Math.round(c.getBoundingClientRect().top)); const card = document.querySelector('#p1-units .unit-card').getBoundingClientRect(); const end = document.getElementById('btn-end').getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth > vw + 1 || document.documentElement.scrollHeight > vh + 1, perRow: tops.filter(t => t === tops[0]).length, rows: new Set(tops).size, card: [Math.round(card.width), Math.round(card.height)], endOnScreen: end.bottom <= vh && end.top >= 0, hintAbove: document.getElementById('turn-hint').getBoundingClientRect().bottom <= end.top + 1 || ${land} }; })()`);
            console.log('  layout:', JSON.stringify(m));
            check(!m.overflow && m.endOnScreen, 'no overflow, END TURN on screen');
            check(m.perRow === 3, `three unit types per row (${m.perRow})`);
            if (land) check(m.card[1] >= 80 && m.card[1] <= 125, `landscape card size (${m.card})`);
            await b.click('#p1-units-energizer-col .unit-card.interactive'); await sleep(500);
            check(await b.eval('gameApp.state.p1.energy === 1'), 'tap works on touch');
            check(await b.eval(`!(document.getElementById('action-chip')?.classList.contains('visible')) && document.getElementById('unit-preview').classList.contains('hidden')`), 'no sticky hover popups after a tap');
            await b.eval(`document.getElementById('btn-buy').click(); true`); await sleep(800);
            const shop = await b.eval(`(() => { const c = document.querySelector('#shop-modal .modal-content').getBoundingClientRect(); return c.top >= -1 && c.bottom <= innerHeight + 1; })()`);
            check(shop, 'shop fits the screen');
            await b.shot(`ui_${which}_shop`);
        }
        const errs = b.logs.filter(l => !/favicon/.test(l));
        if (errs.length) console.log('  console:\n    ' + errs.join('\n    '));
    } catch (e) { console.error('SCRIPT ERR', e); failures++; }
    b.close();
    console.log(`== ui ${which}: ${failures ? failures + ' FAILED' : 'all passed'} ==`);
    process.exit(failures ? 1 : 0);
})();
