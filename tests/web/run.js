// Runs the headless-Chrome play-tests and prints one PASS/FAIL table.
//   node tests/web/run.js            all local scenarios
//   node tests/web/run.js --online   also the two-peer PeerJS test (needs internet)
//   node tests/web/run.js --only ui:mobile,loop:hotseat
//   BASE=https://bojanbozovic.com/Build-Order/web/ node tests/web/run.js   (test the live site; no local server)
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const online = args.includes('--online');
const onlyArg = args[args.indexOf('--only') + 1];
const only = args.includes('--only') && onlyArg ? onlyArg.split(',') : null;

// scenario file : argument, grouped so each group runs in parallel on its own debug ports
const GROUPS = [
    ['suite:hotseat', 'suite:victory', 'suite:restart', 'suite:names', 'suite:aiattack'],
    ['tutorial:desktop', 'tutorial:mobile', 'loop:hotseat', 'loop:ai'],
    ['ui:desktop', 'ui:hotseat-combat', 'ui:reduced', 'ui:mobile', 'ui:landscape'],
];
if (online || (only && only.some(o => o.startsWith('online')))) GROUPS.push(['online:']);

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

function runOne(name, base, debugPort) {
    const [file, arg] = name.split(':');
    return new Promise(resolve => {
        const out = [];
        const child = spawn(process.execPath, [path.join(__dirname, 'scenarios', file + '.js'), ...(arg ? [arg] : []), String(debugPort)],
            { env: { ...process.env, BASE: base, CDP_PORT: String(debugPort) } });
        child.stdout.on('data', d => out.push(d.toString()));
        child.stderr.on('data', d => out.push(d.toString()));
        const timer = setTimeout(() => { child.kill(); out.push('\n[timeout after 10 min]'); }, 10 * 60 * 1000);
        child.on('close', code => { clearTimeout(timer); resolve({ name, code, output: out.join('') }); });
    });
}

(async () => {
    let server = null, base = process.env.BASE;
    if (!base) {
        const port = await freePort();
        server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), ROOT, String(port)], { stdio: 'ignore' });
        base = `http://127.0.0.1:${port}/web/`;
        await new Promise(r => setTimeout(r, 800));
    }
    console.log(`Testing ${base}\n`);
    const results = [];
    let debugPort = 9500;
    for (const group of GROUPS) {
        const wanted = group.filter(n => !only || only.some(o => n.startsWith(o)));
        if (!wanted.length) continue;
        const batch = await Promise.all(wanted.map(n => runOne(n, base, debugPort += 2)));
        for (const r of batch) {
            results.push(r);
            console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${r.name}`);
            if (r.code !== 0) console.log(r.output.split('\n').filter(l => /FAIL|ERR|STALLED|timeout/.test(l)).map(l => '      ' + l).join('\n'));
        }
    }
    if (server) server.kill();
    const failed = results.filter(r => r.code !== 0);
    console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
    if (failed.length) {
        console.log('\nFull output of failed scenarios:');
        for (const r of failed) console.log(`\n--- ${r.name} ---\n${r.output}`);
    }
    process.exit(failed.length ? 1 : 0);
})();
