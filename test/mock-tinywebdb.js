/*
 * 极简 TinyWebDB 模拟服务：本地联调排行榜用（正式部署不需要它）。
 * 启动：node test/mock-tinywebdb.js   → 监听 http://127.0.0.1:8124/api
 * 测试账号：user=test  secret=test123
 */
'use strict';

const http = require('http');
const { URLSearchParams } = require('url');

const USER = 'test';
const SECRET = 'test123';
const PORT = 8124;

// store 保持插入顺序，seq 用来按「最新在前」排序
const store = []; // { tag, value, seq }
let seq = 0;

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const p = new URLSearchParams(body);
      if (p.get('user') !== USER || p.get('secret') !== SECRET) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: 'account invalid' }));
      }

      if (p.get('action') === 'update') {
        const tag = p.get('tag');
        const value = p.get('value');
        const i = store.findIndex((e) => e.tag === tag);
        if (i >= 0) store[i] = { tag, value, seq: store[i].seq };
        else store.push({ tag, value, seq: seq++ });
        return res.end(JSON.stringify({ update: 'ok' }));
      }

      if (p.get('action') === 'search') {
        const no = parseInt(p.get('no') || '1', 10);
        const count = parseInt(p.get('count') || '100', 10);
        const prefix = p.get('tag') || '';
        const matched = store
          .filter((e) => e.tag.startsWith(prefix))
          .sort((a, b) => b.seq - a.seq);
        const out = {};
        for (const e of matched.slice(no - 1, no - 1 + count)) out[e.tag] = e.value;
        return res.end(JSON.stringify(out));
      }

      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'unknown action' }));
    });
  })
  .listen(PORT, () => console.log(`mock tinywebdb listening on http://127.0.0.1:${PORT}/api`));
