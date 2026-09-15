/**
 * fetch-yahoo.js — 야후 파이낸스 일별 종가 → cache/yahoo.json (FRED 보다 빠른 당일치)
 *
 *   node fetch-yahoo.js
 *
 * 왜: FRED 의 유가(EIA)·국채·VIX 는 3~5일 늦다. 야후는 키 없이 전일·당일까지 준다.
 *     화면은 FRED 값을 본체로 두고, FRED 마지막 날짜 이후 구간만 야후 값을 점선으로 이어 붙인다(ECOS 연장과 같은 방식).
 * 주의: 비공식 엔드포인트라 예고 없이 막힐 수 있다. 막히면 이 단계만 실패(exit 0)하고 FRED 본체는 그대로 남는다.
 *       유가는 선물(BZ=F·CL=F)이고 FRED 는 현물이라 성격이 다르다 — 화면에 '선물' 이라고 적는다.
 *       ^TNX·^TYX 는 2026-09-13 실측상 % 그대로 온다(4.975) — scale 1. 값이 40 대로 오면 ×10 이니 다시 확인.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CACHE = path.join(ROOT, 'cache', 'yahoo.json');
const SYMS = [
  { key: 'brent', sym: 'BZ=F', label: '브렌트 선물', scale: 1 },
  { key: 'wti', sym: 'CL=F', label: 'WTI 선물', scale: 1 },
  { key: 'natgas', sym: 'NG=F', label: '천연가스 선물', scale: 1 },
  { key: 'ust10', sym: '^TNX', label: '미국채 10년 (CBOE)', scale: 1 },
  { key: 'ust30', sym: '^TYX', label: '미국채 30년 (CBOE)', scale: 1 },
  { key: 'vix', sym: '^VIX', label: 'VIX', scale: 1 },
  { key: 'sp500', sym: '^GSPC', label: 'S&P 500', scale: 1 },
  { key: 'gold', sym: 'GC=F', label: '금 선물 ($/oz)', scale: 1 },
  // 아침 브리핑(digest.js)용 — FRED 계열과 키가 겹치지 않게 이름을 달리한다(dxy ≠ FRED dxy_broad, krw ≠ FRED usdkrw)
  { key: 'nasdaq', sym: '^IXIC', label: '나스닥 종합', scale: 1 },
  { key: 'sox', sym: '^SOX', label: '필라델피아 반도체', scale: 1 },
  { key: 'dxy', sym: 'DX-Y.NYB', label: '달러인덱스 (ICE DXY)', scale: 1 },
  { key: 'krw', sym: 'KRW=X', label: '원/달러 (야후)', scale: 1 },
  { key: 'move', sym: '^MOVE', label: 'MOVE (채권 변동성)', scale: 1 },
  { key: 'hyg', sym: 'HYG', label: '하이일드 회사채 ETF', scale: 1 },
  { key: 'lqd', sym: 'LQD', label: '투자등급 회사채 ETF', scale: 1 },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function one(s) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.sym)}?range=2y&interval=1d`;
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (personal research dashboard)' }, signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json(); const r = j.chart && j.chart.result && j.chart.result[0];
    if (!r) throw new Error((j.chart && j.chart.error && j.chart.error.description) || '결과 없음');
    const ts = r.timestamp || [], cl = (r.indicators.quote[0] || {}).close || [];
    const tz = r.meta.exchangeTimezoneName || 'America/New_York';
    const rows = []; const seen = new Set();
    for (let i = 0; i < ts.length; i++) {
      const v = cl[i]; if (v == null || !Number.isFinite(v)) continue;
      const d = new Date(ts[i] * 1000).toLocaleDateString('sv-SE', { timeZone: tz }); // 거래소 현지 날짜
      if (seen.has(d)) { rows[rows.length - 1] = [d, +(v * s.scale).toFixed(4)]; continue; }
      seen.add(d); rows.push([d, +(v * s.scale).toFixed(4)]);
    }
    return { rows, live: r.meta.regularMarketPrice != null ? +(r.meta.regularMarketPrice * s.scale).toFixed(4) : null };
  } finally { clearTimeout(t); }
}

async function main() {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const prev = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : { series: {} };
  const out = { fetchedAt: new Date().toISOString().slice(0, 16).replace('T', ' '), source: 'Yahoo Finance chart API (비공식)', series: { ...(prev.series || {}) }, errors: [] };
  for (const s of SYMS) {
    try {
      const r = await one(s);
      if (!r.rows.length) throw new Error('관측 없음');
      out.series[s.key] = { sym: s.sym, label: s.label, rows: r.rows, live: r.live };
      console.log(`  ${s.key} (${s.sym}): ${r.rows.length}건 ~ ${r.rows[r.rows.length - 1][0]} = ${r.rows[r.rows.length - 1][1]}`);
    } catch (e) { out.errors.push(`${s.key} ${s.sym}: ${e.message}`); console.log(`  ${s.key} (${s.sym}): FAIL ${e.message}`); }
    await sleep(400);
  }
  if (!Object.values(out.series).some((x) => x.rows && x.rows.length)) { console.log('YAHOO FAIL: 받은 계열 없음 — 옛 캐시 유지'); return; }
  fs.writeFileSync(CACHE, JSON.stringify(out), 'utf8');
  console.log(`→ cache/yahoo.json · ${Object.keys(out.series).length}계열 · 오류 ${out.errors.length}건`);
}
main().catch((e) => console.log('YAHOO FAIL:', e.message)).finally(() => process.exit(0));
