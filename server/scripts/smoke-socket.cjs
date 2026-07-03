// 验收批 4：socket 事件
const path = require('path');
const req = require('module').createRequire(path.join(__dirname, '..', 'package.json'));
const { io } = req('socket.io-client');
const http = require('http');

const BASE = 'http://localhost:3222';

function post(url, body, cookie) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + url);
    const data = JSON.stringify(body);
    const opts = {
      method: 'POST', hostname: u.hostname, port: u.port, path: u.pathname,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    if (cookie) opts.headers['Cookie'] = cookie;
    const rq = http.request(opts, (rs) => {
      const chunks = [];
      rs.on('data', (c) => chunks.push(c));
      rs.on('end', () => {
        resolve({ status: rs.statusCode, headers: rs.headers, body: JSON.parse(Buffer.concat(chunks).toString()) });
      });
    });
    rq.on('error', reject);
    rq.write(data); rq.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`[T+${((Date.now()-t0)/1000).toFixed(1)}s]`, ...a);

async function connectSocket(cookie) {
  return new Promise((resolve, reject) => {
    const opts = { transports: ['websocket'], forceNew: true, timeout: 5000 };
    if (cookie) opts.extraHeaders = { Cookie: cookie };
    const s = io(BASE, opts);
    // 提前挂 listener 以免错过第一帧
    s.helloPromise = new Promise((r) => s.once('auth:hello', r));
    s.once('connect', () => resolve(s));
    s.once('connect_error', (e) => reject(e));
  });
}

async function main() {
  // 从环境变量拿预备好的 cookie（避免 script 里再吃 argon2 hash 的 8 秒）
  const cookieAt = process.env.TK_AT_COOKIE || '';
  log('[1] cookie present =', cookieAt.length > 0);

  // 2) 两个 socket
  log('[2] connecting sockets…');
  const [anon, authed] = await Promise.all([
    connectSocket(null),
    connectSocket(cookieAt),
  ]);
  log('    both connected');

  // 3) 抓 auth:hello（listener 已在 io() 后立即挂上）
  const anonHello = await Promise.race([anon.helloPromise, sleep(1500).then(() => null)]);
  const authedHello = await Promise.race([authed.helloPromise, sleep(1500).then(() => null)]);
  log('[3] anon    auth:hello =', JSON.stringify(anonHello));
  log('    authed  auth:hello =', JSON.stringify(authedHello));

  // 4) 匿名 snapshot 空
  log('[4] emit snapshot');
  const snap0 = await new Promise((r) => {
    anon.emit('lobby:chat:snapshot', { _v: 1 }, r);
    setTimeout(() => r('TIMEOUT'), 3000);
  });
  log('[4] anon snapshot len =', Array.isArray(snap0) ? snap0.length : `err=${snap0}`);

  // 5) 匿名 send → CHAT_MUTED
  const anonErr = await new Promise((r) => {
    anon.once('chat:error', r);
    anon.emit('lobby:chat:send', { content: '偷发', _v: 1 });
    setTimeout(() => r(null), 500);
  });
  log('[5] anon send → chat:error =', JSON.stringify(anonErr));

  // 6) authed send → 广播到 anon + authed（提前挂 listener 再 emit）
  const authedGotP = new Promise((r) => { authed.once('lobby:chat:message', r); setTimeout(() => r(null), 1500); });
  const anonGotP = new Promise((r) => { anon.once('lobby:chat:message', r); setTimeout(() => r(null), 1500); });
  authed.emit('lobby:chat:send', { content: 'hello lobby', _v: 1 });
  const [authedGot, anonGot] = await Promise.all([authedGotP, anonGotP]);
  log('[6] authed 发言 → authed 收 =', authedGot?.content, '| anon 收 =', anonGot?.content);

  // 7) 1s 内再发 → RATE_LIMIT
  const rateErr = await new Promise((r) => {
    authed.once('chat:error', r);
    authed.emit('lobby:chat:send', { content: 'again', _v: 1 });
    setTimeout(() => r(null), 500);
  });
  log('[7] rate-limit =', JSON.stringify(rateErr));

  // 8) 太长
  await sleep(1200);
  const tooLongErr = await new Promise((r) => {
    authed.once('chat:error', r);
    authed.emit('lobby:chat:send', { content: 'X'.repeat(201), _v: 1 });
    setTimeout(() => r(null), 500);
  });
  log('[8] too-long =', JSON.stringify(tooLongErr));

  // 9) snapshot 应含 1 条
  const snap1 = await new Promise((r) => anon.emit('lobby:chat:snapshot', { _v: 1 }, r));
  log('[9] snapshot len =', snap1.length, snap1.length > 0 ? `first=${snap1[0].content}` : '');

  // 10) version:switch → switched
  const switched = await new Promise((r) => {
    authed.once('version:switched', r);
    authed.emit('version:switch', { versionId: 'standard-2014', _v: 1 });
    setTimeout(() => r(null), 500);
  });
  log('[10] version:switched =', JSON.stringify(switched));

  // 11) 未知版本 → room:error
  const roomErr1 = await new Promise((r) => {
    authed.once('room:error', r);
    authed.emit('version:switch', { versionId: 'unknown-v', _v: 1 });
    setTimeout(() => r(null), 500);
  });
  log('[11] unknown version → room:error =', JSON.stringify(roomErr1));

  // 12) 匿名 version:switch → room:error UNAUTHORIZED
  const roomErr2 = await new Promise((r) => {
    anon.once('room:error', r);
    anon.emit('version:switch', { versionId: 'standard-2014', _v: 1 });
    setTimeout(() => r(null), 500);
  });
  log('[12] anon version:switch → room:error =', JSON.stringify(roomErr2));

  anon.close();
  authed.close();
  console.log('== batch 4 done ==');
  process.exit(0);
}

main().catch((e) => { console.error('ERR:', e); process.exit(1); });
