// Drives the tutorial to its victory screen. Usage: node t_tutorial.js [desktop|mobile]
const { launch, sleep } = require('../cdp.js');
const BASE = process.env.BASE || 'http://127.0.0.1:8001/web/';
const mobile = process.argv[2] === 'mobile';
(async () => {
    const b = mobile ? await launch({ port: parseInt(process.env.CDP_PORT, 10) || 9438, width: 390, height: 844, mobile: true }) : await launch({ port: parseInt(process.env.CDP_PORT, 10) || 9437 });
    const tag = mobile ? 'm' : 'd';
    const log = (...a) => console.log(`[${tag}]`, ...a);
    let ok = false;
    try {
        await b.goto(BASE);
        await b.waitFor('window.gameApp && window.gameApp.isLoaded', 90000);
        await sleep(1500);
        await b.click('#btn-tutorial-yes');
        await b.waitFor('window.gameApp.state && window.gameApp.isTutorial', 10000);
        let lastText = '', same = 0;
        for (let i = 0; i < 120; i++) {
            await sleep(1200);
            const info = await b.eval(`(() => { const a = window.gameApp; const ov = document.querySelector('.tutorial-overlay .tutorial-text'); const hl = Array.from(document.querySelectorAll('.tutorial-highlight')).map(e => e.id); return { step: a.tutorialStep, text: ov ? ov.textContent.slice(0, 90) : '', btn: !!document.querySelector('.tutorial-overlay .tutorial-btn'), hl, lock: a.isTurnTransitioning, proc: a.processingTurn, phase: a.state.phase, cur: a.state.currentPlayer, victory: !!document.getElementById('tutorial-victory-overlay'), shop: !document.getElementById('shop-modal').classList.contains('hidden') }; })()`);
            if (info.victory) { log('VICTORY overlay reached at iteration', i); ok = true; break; }
            if (info.text !== lastText) { log(`step ${info.step} [${info.phase}/${info.cur}] hl=${info.hl.join(',')} :: ${info.text}`); lastText = info.text; same = 0; } else same++;
            if (info.lock || info.proc) continue;
            if (info.btn) { await b.click('.tutorial-overlay .tutorial-btn'); continue; }
            if (info.shop) {
                const id = await b.eval(`(() => { const el = document.querySelector('.shop-list-item:not(.disabled)'); return el ? el.dataset.unitId : null; })()`);
                if (id) { await b.click(`.shop-list-item[data-unit-id="${id}"]`); await sleep(300); if (mobile) await b.click('#mobile-shop-buy'); }
                else await b.click('#shop-modal .close-btn');
                continue;
            }
            const hl = info.hl;
            if (info.phase === 'Breach' && !hl.length) { await b.click('#btn-end'); continue; } // nothing highlighted: attack the base
            if (info.text.includes('Finish this')) { await b.click('#p1-units-energizer-col .unit-card.interactive:not(.exhausted)'); await sleep(500); await b.click('#p1-units-striker-col .unit-card.interactive:not(.exhausted)'); await sleep(500); await b.click('#btn-end'); continue; }
            const unitCol = hl.find(h => h.includes('-col'));
            if (unitCol && hl.includes('btn-end')) { await b.click('#btn-end'); continue; }
            if (unitCol) { const c = await b.click(`#${unitCol} .unit-card.interactive`); if (!c) await b.click(`#${unitCol}`); continue; }
            if (hl.includes('btn-buy')) { await b.click('#btn-buy'); continue; }
            if (hl.includes('btn-end')) { await b.click('#btn-end'); continue; }
            if (info.text.startsWith('Tap your Energizer')) { await b.click('#p1-units-energizer-col .unit-card.interactive'); continue; }
            if (info.text.includes('Tap the Striker')) { await b.click('#p1-units-striker-col .unit-card.interactive'); continue; }
            if (info.text.startsWith('The AI just bought') || info.text.startsWith('Now you have 3 Gold')) { await b.click('#p1-units-energizer-col .unit-card.interactive'); await sleep(300); await b.click('#p1-units-miner-col .unit-card.interactive'); await sleep(300); if (info.text.startsWith('Now you have')) await b.click('#btn-buy'); continue; }
            if (same > 12) { log('STALLED', JSON.stringify(info)); await b.shot(`tut_stalled_${tag}`); break; }
        }
        const errs = b.logs.filter(l => !/favicon/.test(l));
        if (errs.length) log('console:', errs.join(' | '));
    } catch (e) { console.error('SCRIPT ERR', e); }
    console.log(`== tutorial ${tag}: ${ok ? 'all passed' : 'FAILED'} ==`);
    b.close(); process.exit(ok ? 0 : 1);
})();
