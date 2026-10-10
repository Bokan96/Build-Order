// Static file server for play-testing (large listen backlog so several headless browsers can load at once)
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2];
const PORT = parseInt(process.argv[3] || '8001', 10);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.py': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.json': 'application/json' };
http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(path.resolve(ROOT))) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
    });
}).listen(PORT, '127.0.0.1', 511, () => console.log('serving', ROOT, 'on', PORT));
