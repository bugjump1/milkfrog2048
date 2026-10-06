/*
 * 本地预览用静态服务器：带 Cache-Control: no-store，改完代码刷新即生效。
 * 启动：node tools/dev-server.mjs  → http://127.0.0.1:8123
 * （python -m http.server 也能用，但可能吃到浏览器启发式缓存）
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8123;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let rel = normalize(pathname).replace(/^([/\\])+/, '');
    if (rel === '' || rel === '.') rel = 'index.html';
    const file = join(root, rel);
    if (!normalize(file).startsWith(root)) throw new Error('forbidden');
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found: ' + req.url);
  }
}).listen(PORT, () => console.log(`dev server (no-cache) on http://127.0.0.1:${PORT}`));
