// Локальный сервер «Казны»: отдаёт kazna.html и хранит данные в data/db.json.
// Запуск: node server.js   (PORT, HOST, KAZNA_OPEN=1 — через переменные окружения)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const KEY_FILE = path.join(DATA_DIR, 'key.txt');
const PORT = +process.env.PORT || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const OPEN = process.env.KAZNA_OPEN === '1';
const COLLECTIONS = ['accounts', 'categories', 'projects', 'parties', 'ops'];
const MAX_BODY = 256 * 1024;

fs.mkdirSync(DATA_DIR, {recursive: true});

// Ключ доступа: без него страница и данные не отдаются.
let KEY = fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, 'utf8').trim() : '';
if (!KEY) { KEY = crypto.randomBytes(12).toString('base64url'); fs.writeFileSync(KEY_FILE, KEY); }

// База: {version, data: {collection: {id: doc}}}. При первом запуске заливаются демо-данные из seed/.
function seed() {
  const data = Object.fromEntries(COLLECTIONS.map(c => [c, {}]));
  const dir = path.join(ROOT, 'seed');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^batch\d+\.json$/.test(f)).sort() : []) {
    for (const w of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) if (w.op === 'set' && data[w.collection]) data[w.collection][w.doc_id] = w.data;
  }
  return {version: 1, data};
}
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : seed();
for (const c of COLLECTIONS) db.data[c] = db.data[c] || {};
function save() { db.version++; const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DB_FILE); }
if (!fs.existsSync(DB_FILE)) { db.version = 0; save(); }

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(a, b) { const out = {...a}; for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : v; return out; }

const SKELETON_HEAD = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px/1.4 system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, {'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra});
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const cookieKey = req => { const m = /(?:^|;\s*)kz=([^;]+)/.exec(req.headers.cookie || ''); return m ? decodeURIComponent(m[1]) : ''; };
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null); } catch { reject(new Error('bad_json')); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const given = url.searchParams.get('k');
  if (!OPEN && given && safeEq(given, KEY)) {
    return send(res, 302, '', 'text/plain', {location: url.pathname, 'set-cookie': `kz=${encodeURIComponent(KEY)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`});
  }
  if (!OPEN && !safeEq(cookieKey(req), KEY)) {
    return send(res, 401, '<!doctype html><meta charset="utf-8"><title>Казна</title><p style="font:16px system-ui;margin:40px">Нужна ссылка с ключом доступа. Попросите её у владельца.</p>', 'text/html; charset=utf-8');
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return send(res, 200, SKELETON_HEAD + fs.readFileSync(path.join(ROOT, 'kazna.html'), 'utf8') + '</body></html>', 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/api/db') {
    const since = +url.searchParams.get('v');
    if (since === db.version) return send(res, 204, '');
    return send(res, 200, db);
  }
  const m = /^\/api\/db\/([a-z]+)\/([A-Za-z0-9_\-.~:@+]{1,200})$/.exec(url.pathname);
  if (m && COLLECTIONS.includes(m[1])) {
    const [, col, id] = m; const docs = db.data[col];
    try {
      if (req.method === 'PUT') { const b = await readBody(req); if (!isObj(b)) return send(res, 400, {code: 'invalid_argument'}); docs[id] = b; save(); return send(res, 200, db); }
      if (req.method === 'PATCH') { const b = await readBody(req); if (!isObj(b) || !docs[id]) return send(res, 400, {code: 'invalid_argument'}); docs[id] = merge(docs[id], b); save(); return send(res, 200, db); }
      if (req.method === 'DELETE') { if (docs[id]) { delete docs[id]; save(); } return send(res, 200, db); }
    } catch (e) { return send(res, 400, {code: 'invalid_argument', message: e.message}); }
  }
  send(res, 404, {code: 'not_found'});
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Казна запущена: http://${shown}:${PORT}/${OPEN ? '' : '?k=' + KEY}`);
  console.log(`Данные: ${DB_FILE}`);
  if (!OPEN) console.log('Ссылку с ключом можно отдавать тем, кому нужен доступ. Остановить: Ctrl+C.');
});
