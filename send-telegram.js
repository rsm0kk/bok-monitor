/*
 * send-telegram.js — out/digest.html 을 텔레그램 봇으로 보낸다. GitHub Actions 에서 돈다.
 *
 *   TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID(쉼표로 여러 곳) — 저장소 Secrets. 없으면 SKIP 한 줄, exit 0.
 *   --env-file=<path>   로컬 시험용. KEY=VALUE 파일을 읽는다.
 *   --morning-only      KST 12시 이후면 보내지 않는다(하루 한 번, 09:30 실행분만).
 *   --dry-run           보낼 글자수만.
 *
 * 실패해도 exit 0 — 루틴의 배포 단계는 이미 끝났다. FAIL 한 줄만 남긴다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const argv = (n) => { const h = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : null; };
const has = (f) => process.argv.includes(`--${f}`);
const envFile = argv('env-file');
if (envFile && fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const CHATS = (process.env.TELEGRAM_CHAT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
const scrub = (s) => (TOKEN ? String(s).split(TOKEN).join('<TOKEN>') : String(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (h) => h.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').length;

async function api(method, body) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      if (j.ok) return j.result;
      if (j.error_code === 429 && j.parameters && j.parameters.retry_after) { await sleep((j.parameters.retry_after + 1) * 1000); continue; }
      throw new Error(`${method} ${j.error_code} ${j.description}`);
    } catch (e) { last = e; if (/ 4\d\d /.test(e.message) && !/ 429 /.test(e.message)) break; await sleep(3000 * (i + 1)); }
  }
  throw new Error(scrub(last && last.message));
}

async function main() {
  const f = path.join(__dirname, 'out', 'digest.html');
  if (!fs.existsSync(f)) { console.log('SKIP out/digest.html 없음 — digest.js 먼저'); return 0; }
  const html = fs.readFileSync(f, 'utf8');
  if (has('dry-run')) { console.log(`DRY ${visible(html)}자 · 받는 곳 ${CHATS.length} · 토큰 ${TOKEN ? '있음' : '없음'}`); return 0; }
  if (!TOKEN || !CHATS.length) { console.log('SKIP 텔레그램 미설정 (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)'); return 0; }
  if (has('morning-only')) {
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).format(new Date()));
    if (h >= 12) { console.log(`SKIP KST ${h}시 — 아침 회차만 보냄`); return 0; }
  }
  if (visible(html) > 4096) { console.log(`FAIL ${visible(html)}자 — 4096 초과`); return 0; }
  let ok = 0;
  for (const c of CHATS) {
    try { await api('sendMessage', { chat_id: c, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }); ok += 1; }
    catch (e) { console.log(`FAIL ${c}: ${e.message}`); }
  }
  console.log(`전송 ${ok}/${CHATS.length}곳 · ${visible(html)}자`);
  return 0;
}
main().then((c) => process.exit(c), (e) => { console.log(`FAIL ${scrub(e.message)}`); process.exit(0); });
