/**
 * fetch-rates.js — 당일 금리: 미 재무부 일별 수익률 곡선(명목·실질) + 뉴욕 연은 SOFR·EFFR → cache/rates.json
 *
 *   node fetch-rates.js
 *
 * 왜: FRED 의 국채·실질금리는 1~5일 늦다(2026-09-15 아침에 9/10~9/11). 아침 브리핑에 쓸 수 없다.
 *     재무부 CSV 는 당일 저녁(미 동부) 공개 → 한국 아침에 간밤 세션 값이 있다(2026-09-15 10:40 KST 에 9/14 확인).
 *     뉴욕 연은 SOFR·EFFR 은 다음 영업일 08:00 ET 공개라 하루 늦는 것이 원래 규칙이다.
 * 둘 다 무료·키 없음. 실패하면 이 단계만 건너뛰고(exit 0) 옛 캐시를 남긴다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, 'cache', 'rates.json');
const UA = { 'User-Agent': 'Mozilla/5.0 (personal research dashboard)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, json) {
  let last;
  for (let i = 0; i < 3; i++) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 40000);
    try {
      const res = await fetch(url, { headers: UA, signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return json ? await res.json() : await res.text();
    } catch (e) { last = e; await sleep(3000 * (i + 1)); } finally { clearTimeout(t); }
  }
  throw last;
}

const NOM = { '1 Mo': 'm1', '3 Mo': 'm3', '6 Mo': 'm6', '1 Yr': 'y1', '2 Yr': 'y2', '5 Yr': 'y5', '10 Yr': 'y10', '30 Yr': 'y30' };
const REAL = { '5 YR': 'y5', '10 YR': 'y10', '30 YR': 'y30' };

/** "Date,"1 Mo",…" CSV → [[YYYY-MM-DD, {m3,y2,…}], …] 오름차순 */
function parseCsv(text, map) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
  const out = [];
  for (const ln of lines.slice(1)) {
    const c = ln.split(',');
    const m = (c[0] || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) continue;
    const o = {};
    head.forEach((h, i) => { if (map[h] && c[i] !== '' && c[i] != null && isFinite(+c[i])) o[map[h]] = +c[i]; });
    if (Object.keys(o).length) out.push([`${m[3]}-${m[1]}-${m[2]}`, o]);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

async function treasury(type, map) {
  const et = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/New_York' });
  const y = +et.slice(0, 4);
  const years = +et.slice(5, 7) <= 1 ? [y - 1, y] : [y];   // 1월 초엔 작년 말 관측이 필요하다
  const all = new Map();
  for (const yr of years) {
    const url = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/'
      + `${yr}/all?type=${type}&field_tdr_date_value=${yr}&page&_format=csv`;
    for (const r of parseCsv(await get(url, false), map)) all.set(r[0], r[1]);
  }
  return [...all.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-80);
}

async function nyfed(kind) {
  const j = await get(`https://markets.newyorkfed.org/api/rates/${kind}/last/15.json`, true);
  return (j.refRates || []).map((r) => [r.effectiveDate, +r.percentRate]).filter((r) => isFinite(r[1])).sort((a, b) => a[0].localeCompare(b[0]));
}

async function main() {
  const prev = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  const out = { fetchedAt: new Date().toISOString().slice(0, 16).replace('T', ' '), source: '미 재무부 Daily Treasury Par / Real Yield Curve CSV · 뉴욕 연은 Markets API (키 불필요)', errors: [] };
  const jobs = [
    ['nominal', () => treasury('daily_treasury_yield_curve', NOM)],
    ['real', () => treasury('daily_treasury_real_yield_curve', REAL)],
    ['sofr', () => nyfed('secured/sofr')],
    ['effr', () => nyfed('unsecured/effr')],
  ];
  for (const [k, fn] of jobs) {
    try {
      const rows = await fn();
      if (!rows.length) throw new Error('관측 없음');
      out[k] = rows;
      const l = rows[rows.length - 1];
      console.log(`  ${k}: ${rows.length}건 ~ ${l[0]} = ${JSON.stringify(l[1])}`);
    } catch (e) {
      out.errors.push(`${k}: ${e.message}`);
      if (prev[k]) out[k] = prev[k];
      console.log(`  ${k}: FAIL ${e.message}${prev[k] ? ' (옛 캐시 유지)' : ''}`);
    }
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(out), 'utf8');
  console.log(`→ cache/rates.json · 오류 ${out.errors.length}건`);
}
main().catch((e) => console.log('RATES FAIL:', e.message)).finally(() => process.exit(0));
