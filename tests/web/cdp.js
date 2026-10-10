// Minimal Chrome DevTools Protocol driver for the play-tests (no dependencies; Node 22+).
// Launches headless Chrome, and exposes eval/click/waitFor/screenshot plus a game-state summary.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROFILES = path.join(__dirname, '.profiles');
const SHOTS = path.join(__dirname, 'shots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
    ].filter(Boolean);
    const found = candidates.find(p => fs.existsSync(p));
    if (!found) throw new Error('Chrome not found. Set CHROME_PATH to the browser executable.');
    return found;
}

async function launch({ port = 9333, width = 1600, height = 900, mobile = false } = {}) {
    fs.mkdirSync(PROFILES, { recursive: true });
    const chrome = spawn(findChrome(), [
        '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(PROFILES, 'p' + port)}`,
        `--window-size=${width},${height}`, '--autoplay-policy=no-user-gesture-required',
        '--mute-audio', '--no-first-run', '--no-default-browser-check', 'about:blank'
    ], { stdio: 'ignore' });
    let wsUrl;
    for (let i = 0; i < 100 && !wsUrl; i++) {
        try {
            const j = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
            const p = j.find(t => t.type === 'page');
            if (p) wsUrl = p.webSocketDebuggerUrl;
        } catch (e) { }
        if (!wsUrl) await sleep(200);
    }
    if (!wsUrl) { chrome.kill(); throw new Error(`Chrome did not expose a debug page on port ${port}`); }
    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));
    let id = 0; const pending = new Map(); const logs = [];
    ws.addEventListener('message', (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
        if (m.method === 'Runtime.consoleAPICalled') {
            const t = m.params.args.map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
            if (m.params.type === 'error' || m.params.type === 'warning') logs.push(`[console.${m.params.type}] ${t}`);
        } else if (m.method === 'Runtime.exceptionThrown') {
            const d = m.params.exceptionDetails;
            logs.push(`[EXCEPTION] ${d.exception ? d.exception.description : d.text} @${d.url || ''}:${d.lineNumber}`);
        } else if (m.method === 'Log.entryAdded') {
            if (m.params.entry.level === 'error') logs.push(`[log.error] ${m.params.entry.text} ${m.params.entry.url || ''}`);
        }
    });
    const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });

    const api = {
        send, logs, sleep,
        async goto(url) { await send('Page.navigate', { url }); },
        async eval(expr) {
            const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
            if (r.result && r.result.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
            return r.result && r.result.result ? r.result.result.value : undefined;
        },
        async shot(name) {
            const r = await send('Page.captureScreenshot', { format: 'png' });
            fs.mkdirSync(SHOTS, { recursive: true });
            const f = path.join(SHOTS, name + '.png');
            fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
            return f;
        },
        // Real mouse click at the element's centre (respects pointer-events and overlays)
        async click(selector) {
            const box = await api.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height}; })()`);
            if (!box || !box.w) return false;
            for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
                await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
            return true;
        },
        async waitFor(expr, timeout = 60000, step = 250) {
            const t0 = Date.now();
            while (Date.now() - t0 < timeout) { const v = await api.eval(expr); if (v && !v.__error) return v; await sleep(step); }
            return false;
        },
        // Compact summary of the game state (units: first 3 letters, * tapped, ! attacking, # blocking)
        state: () => api.eval(`(() => { const a = window.gameApp; if (!a || !a.state) return null; const s = a.state; const sum = p => ({hp:p.hp, gold:p.gold, energy:p.energy, atk:p.atk, units: p.units.map(u => u.type[0].toUpperCase()+u.type.slice(1,3)+(u.exhausted?'*':'')+(u.attacking?'!':'')+(u.blocking?'#':'')).join(' ')}); return {turn:s.turn, phase:s.phase, cur:s.currentPlayer, lock:a.isTurnTransitioning, proc:a.processingTurn, p1:sum(s.p1), p2:sum(s.p2), combat:s.combat, btnEnd: document.getElementById('btn-end').textContent + (document.getElementById('btn-end').disabled?' [disabled]':''), body: document.body.className}; })()`),
        lastLog: (n = 6) => api.eval(`Array.from(document.querySelectorAll('#combat-log .log-entry')).slice(-${n}).map(e => e.textContent)`),
        close() { try { ws.close(); } catch (e) { } chrome.kill(); }
    };
    return api;
}

module.exports = { launch, sleep };
