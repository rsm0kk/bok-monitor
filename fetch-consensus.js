/**
 * fetch-consensus.js — 미국 지표 컨센서스(예상치) 스냅샷 → cache/consensus.json
 *
 *   node fetch-consensus.js          이번 주 예상치를 받아 누적하고, 발표가 지난 건은 FRED 실제치로 판정
 *   node fetch-consensus.js --test   가짜 이벤트로 판정 로직만 검사 (네트워크 없음)
 *
 * 왜: FRED 에는 컨센서스가 없다. ForexFactory 가 위젯용으로 공개하는 주간 JSON(예상·이전치, 실제치 없음)이
 *     무료로 열리는 유일한 소스라, 매일 배치가 "이번 주" 예상치를 저장해 두고 발표 뒤 FRED 실제치와 맞춘다.
 *     그래서 기록은 도입일(2026-09-14) 이후부터 쌓인다. 과거 컨센서스는 소급하지 않는다.
 *
 * 판정 방식: 스냅샷 때 그 지표의 FRED 마지막 관측일(baselineLast)을 적어 두고, 그보다 새 관측이 생기면 그 값이 실제치다.
 *   (배치 16:30 KST 는 미국 발표 21:30 KST 보다 앞이라 스냅샷이 항상 발표보다 먼저다.)
 *   연방기금금리처럼 매일 값이 있는 계열은 '발표일 다음 관측일' 값을 쓴다.
 *   실제치를 예상치와 같은 자릿수로 반올림해 상회/보합/하회를 정한다. FRED 값은 나중에 개정될 수 있어 첫 판정 뒤에는 고정한다.
 *
 * 비공식 피드라 형식이 바뀌면 여기만 실패하고(exit 0) 나머지 대시보드는 그대로 간다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CACHE = path.join(ROOT, 'cache', 'consensus.json');
const FRED = path.join(ROOT, 'cache', 'fred.json');
const FEED = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const SINCE = '2026-09-14';

// ForexFactory 제목 → FRED 계열·변환. tf: mom(전월비 %) · yoy · diff(전월 증감, 천명) · level · annq(전기비 연율) · rate_on_date(발표일 이후 첫 값)
// scale: FRED 단위 → 피드 단위 (K=천, M=백만). FRED PAYEMS·ICSA·JTSJOL·HOUST 단위가 다르다.
const MAP = {
  'CPI m/m': { key: 'cpi', tf: 'mom', unit: '%' },
  'Core CPI m/m': { key: 'core_cpi', tf: 'mom', unit: '%' },
  'CPI y/y': { key: 'cpi', tf: 'yoy', unit: '%' },
  'PPI m/m': { key: 'ppi', tf: 'mom', unit: '%' },
  'Core PPI m/m': { key: 'ppi_core', tf: 'mom', unit: '%' },
  'Core PCE Price Index m/m': { key: 'core_pce', tf: 'mom', unit: '%' },
  'PCE Price Index m/m': { key: 'pce', tf: 'mom', unit: '%' },
  'Non-Farm Employment Change': { key: 'payems', tf: 'diff', unit: 'K', scale: 1 },
  'Unemployment Rate': { key: 'unrate', tf: 'level', unit: '%' },
  'Average Hourly Earnings m/m': { key: 'ahe', tf: 'mom', unit: '%' },
  'Unemployment Claims': { key: 'claims', tf: 'level', unit: 'K', scale: 1e-3 },
  'Retail Sales m/m': { key: 'retail', tf: 'mom', unit: '%' },
  'Industrial Production m/m': { key: 'indpro', tf: 'mom', unit: '%' },
  'Capacity Utilization Rate': { key: 'tcu', tf: 'level', unit: '%' },
  'Housing Starts': { key: 'houst', tf: 'level', unit: 'M', scale: 1e-3 },
  'JOLTS Job Openings': { key: 'jolts', tf: 'level', unit: 'M', scale: 1e-3 },
  'Durable Goods Orders m/m': { key: 'durables', tf: 'mom', unit: '%' },
  'Advance GDP q/q': { key: 'gdp', tf: 'annq', unit: '%' },
  'Prelim GDP q/q': { key: 'gdp', tf: 'annq', unit: '%' },
  'Final GDP q/q': { key: 'gdp', tf: 'annq', unit: '%' },
  'Federal Funds Rate': { key: 'ffr_upper', tf: 'rate_on_date', unit: '%' },
  'Prelim UoM Consumer Sentiment': { key: 'umcsent', tf: 'level', unit: '' },
  'Revised UoM Consumer Sentiment': { key: 'umcsent', tf: 'level', unit: '' },
};

function parseNum(s) {
  if (s == null) return null;
  const t = String(s).trim(); if (!t) return null;
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*([%KMB])?$/i); if (!m) return null;
  return { v: Number(m[1]), unit: (m[2] || '').toUpperCase(), dec: (m[1].split('.')[1] || '').length };
}
const round = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

/** FRED 계열에서 이벤트의 실제치를 찾는다. 없으면 null. */
function resolve(ev, fred) {
  const map = MAP[ev.title]; if (!map) return null;
  const s = fred.series && fred.series[map.key]; if (!s || !s.rows.length) return null;
  const rows = s.rows;
  let obs = null;
  if (map.tf === 'rate_on_date') { obs = rows.find((r) => r[0] > ev.date.slice(0, 10)); }
  else { obs = rows.find((r) => r[0] > (ev.baselineLast || '0000')); }
  if (!obs) return null;
  const i = rows.indexOf(obs);
  let v = null;
  if (map.tf === 'mom' || map.tf === 'yoy') { const lag = map.tf === 'mom' ? 1 : 12; if (i >= lag && rows[i - lag][1]) v = (obs[1] / rows[i - lag][1] - 1) * 100; }
  else if (map.tf === 'diff') { if (i >= 1) v = obs[1] - rows[i - 1][1]; }
  else if (map.tf === 'annq') { if (i >= 1) v = (Math.pow(obs[1] / rows[i - 1][1], 4) - 1) * 100; }
  else v = obs[1];
  if (v == null) return null;
  if (map.scale) v *= map.scale;
  const f = parseNum(ev.forecast);
  const dec = f ? f.dec : 1;
  const a = round(v, dec);
  const verdict = f ? (a > f.v ? '상회' : a < f.v ? '하회' : '보합') : null;
  return { actual: a, actualRaw: v, actualDate: obs[0], verdict, unit: map.unit };
}

function baseline(ev, fred) {
  const map = MAP[ev.title]; if (!map || !fred.series || !fred.series[map.key]) return null;
  const rows = fred.series[map.key].rows; return rows.length ? rows[rows.length - 1][0] : null;
}

async function main() {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const test = process.argv.includes('--test');
  const fred = fs.existsSync(FRED) ? JSON.parse(fs.readFileSync(FRED, 'utf8')) : { series: {} };
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : { since: SINCE, events: {} };
  if (test) {
    const ev = { title: 'CPI m/m', date: '2026-09-10T08:30', forecast: '0.3%', previous: '0.1%', baselineLast: '2026-07-01' };
    const r = resolve(ev, fred);
    const ev2 = { title: 'Federal Funds Rate', date: '2026-08-31T14:00', forecast: '3.75%', previous: '3.75%' };
    console.log('test CPI m/m →', r, '\ntest FFR →', resolve(ev2, fred), '\nparse', parseNum('209K'), parseNum('1.32M'), parseNum('-0.6%'));
    return;
  }
  let feed = [];
  try {
    const res = await fetch(FEED, { headers: { 'User-Agent': 'Mozilla/5.0 (personal research dashboard)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    feed = await res.json();
    if (!Array.isArray(feed)) throw new Error('배열이 아님');
  } catch (e) { console.log(`CONSENSUS WARN: 피드 실패 — ${e.message} (기존 기록으로 판정만 진행)`); }
  let added = 0;
  for (const e of feed) {
    if (e.country !== 'USD' || !e.forecast || !e.date) continue;
    const id = `${e.date.slice(0, 16)}|${e.title}`;
    if (cache.events[id]) continue;
    cache.events[id] = { title: e.title, date: e.date.slice(0, 16), impact: e.impact, forecast: e.forecast, previous: e.previous, mapped: !!MAP[e.title], baselineLast: baseline(e, fred), snapAt: new Date().toISOString().slice(0, 10) };
    added += 1;
  }
  // 판정 — 발표일이 지난 미판정 건
  const now = new Date(); const nowIso = new Date(now.getTime() - 4 * 3600000).toISOString().slice(0, 16); // 피드 시각은 미 동부(대략 UTC-4)
  let resolved = 0;
  for (const ev of Object.values(cache.events)) {
    if (ev.actual != null || !ev.mapped || ev.date > nowIso) continue;
    const r = resolve(ev, fred);
    if (r) { Object.assign(ev, r, { resolvedAt: new Date().toISOString().slice(0, 10) }); resolved += 1; }
  }
  cache.fetchedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
  cache.feed = FEED; cache.map = Object.keys(MAP);
  fs.writeFileSync(CACHE, JSON.stringify(cache), 'utf8');
  const n = Object.keys(cache.events).length, done = Object.values(cache.events).filter((e) => e.actual != null).length;
  console.log(`→ cache/consensus.json · 이벤트 ${n}건 (신규 ${added}) · 판정 완료 ${done} (이번 회차 ${resolved})`);
}
main().catch((e) => console.log('CONSENSUS FAIL:', e.message)).finally(() => process.exit(0));
