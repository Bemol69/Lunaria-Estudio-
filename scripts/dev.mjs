// Servidor local: sirve dist/ y monta las funciones de api/ como en Vercel.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.chdir(path.resolve(import.meta.dirname, '..'));
const PORT = +process.env.PORT || 3000;
const DIST = path.join(process.cwd(), 'dist');
const tipos = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.yml': 'text/yaml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const f = path.join(process.cwd(), url.pathname + '.js');
    if (!fs.existsSync(f)) { res.statusCode = 404; return res.end('{"ok":false}'); }
    req.query = Object.fromEntries(url.searchParams);
    try { return await (await import(pathToFileURL(f) + '?t=' + fs.statSync(f).mtimeMs)).default(req, res); }
    catch (e) { console.error(e); res.statusCode = 500; return res.end('{"ok":false}'); }
  }
  let p = path.join(DIST, decodeURIComponent(url.pathname));
  if (!p.startsWith(DIST)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.statusCode = 404; return res.end('No encontrado'); }
  res.setHeader('Content-Type', tipos[path.extname(p)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(p).pipe(res);
}).listen(PORT, () => console.log('http://localhost:' + PORT));
