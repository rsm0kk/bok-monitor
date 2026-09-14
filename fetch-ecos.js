/**
 * fetch-ecos.js — 보고서 데이터 기준일(2026-08-31) 이후의 최신치를 한국은행 ECOS 에서 받아 cache/ecos.json 에 둔다.
 *
 *   node fetch-ecos.js            out/data.json 의 bok.asOf 이후 ~ 오늘
 *   node fetch-ecos.js --days=90  강제로 최근 N일
 *
 * 왜: 통화신용정책보고서는 연 2회다. 보고서 그림은 8월 말에서 멈추지만 기준금리·국고채·환율·코스피·CPI 는
 * 매일/매월 바뀐다. 대시보드가 "보고서 시점"과 "지금"을 나란히 보여주려면 이 계열이 필요하다.
 *
 * 키: 이 폴더 .env 의 ECOS_API_KEY, 없으면 `국장 매크로 모니터/.env` 를 읽기 전용으로 빌려 쓴다(값을 복사해 두지 않는다).
 * 통계표·항목코드는 국장 매크로 모니터가 2026-08-16 에 StatisticItemList 로 실측 확정한 값이다.
 *
 * 실패해도 exit 0 — 옛 캐시가 남아 있으면 그걸로 그리고, 없으면 화면에 "ECOS 미연동" 을 띄운다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CACHE = path.join(ROOT, 'cache', 'ecos.json');
const BASE = 'https://ecos.bok.or.kr/api';

const SERIES = [
  { id: 'base_rate', label: '한국은행 기준금리', unit: '%', stat: '722Y001', cycle: 'D', items: ['0101000'] },
  { id: 'ktb3', label: '국고채 3년', unit: '%', stat: '817Y002', cycle: 'D', items: ['010200000'] },
  { id: 'ktb10', label: '국고채 10년', unit: '%', stat: '817Y002', cycle: 'D', items: ['010210000'] },
  { id: 'corp_aa', label: '회사채 3년 AA-', unit: '%', stat: '817Y002', cycle: 'D', items: ['010300000'] },
  { id: 'usdkrw', label: '원/달러', unit: '원', stat: '731Y001', cycle: 'D', items: ['0000001'] },
  { id: 'kospi', label: 'KOSPI', unit: 'p', stat: '802Y001', cycle: 'D', items: ['0001000'] },
  { id: 'foreign_net', label: '외국인 순매수(코스피)', unit: '억원', stat: '802Y001', cycle: 'D', items: ['0030000'] },
  { id: 'cpi', label: '소비자물가지수(2020=100)', unit: 'idx', stat: '901Y009', cycle: 'M', items: ['0'] },
];

function arg(name) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function readKey() {
  if (process.env.ECOS_API_KEY) return { key: process.env.ECOS_API_KEY.trim(), from: 'env (GitHub Actions secret)' };
  const cands = [path.join(ROOT, '.env'), path.join(ROOT, '..', '..', '국장 매크로 모니터', '.env')];
  for (const f of cands) {
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, 'utf8').match(/^\s*ECOS_API_KEY\s*=\s*"?([^"\s#]+)/m);
    if (m) return { key: m[1], from: path.relative(ROOT, f) };
  }
  return null;
}

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(key, s, from, to) {
  const parts = [s.stat, s.cycle, from, to, ...s.items];
  const url = `${BASE}/StatisticSearch/${key}/json/kr/1/10000/${parts.map(encodeURIComponent).join('/')}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const json = JSON.parse(await res.text());
    if (json.RESULT) {
      // INFO-200 = 해당 기간 자료 없음 — 오류가 아니라 빈 결과다
      if (json.RESULT.CODE === 'INFO-200') return [];
      throw new Error(`${json.RESULT.CODE} ${json.RESULT.MESSAGE}`);
    }
    const rows = json.StatisticSearch?.row || [];
    return rows.map((r) => {
      const t = String(r.TIME);
      const date = s.cycle === 'D' ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : `${t.slice(0, 4)}-${t.slice(4, 6)}-01`;
      const v = r.DATA_VALUE === '' || r.DATA_VALUE == null ? null : Number(r.DATA_VALUE);
      return [date, Number.isFinite(v) ? v : null];
    }).filter((x) => x[1] != null);
  } finally { clearTimeout(t); }
}

async function main() {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const k = readKey();
  if (!k) { console.log('ECOS SKIP: ECOS_API_KEY 없음 (.env)'); return; }

  let asOf = '2026-01-01';
  try { asOf = JSON.parse(fs.readFileSync(path.join(ROOT, 'out', 'data.json'), 'utf8')).bok.asOf || asOf; } catch { /* data.json 전이면 기본값 */ }
  const days = Number(arg('days') || 0);
  const start = days ? new Date(Date.now() - days * 86400000) : new Date(asOf);
  // 보고서 마지막 날짜와 겹치는 구간(약 40일)을 함께 받아 두 자료가 같은 값을 주는지 화면에서 대조할 수 있게 한다
  start.setDate(start.getDate() - (days ? 0 : 40));
  const today = new Date();
  const from = ymd(start), to = ymd(today);
  // 월별(CPI)은 전년동월비를 계산해야 하므로 14개월 전부터 받는다
  const mStart = new Date(start); mStart.setMonth(mStart.getMonth() - 14);
  const fromM = ymd(mStart).slice(0, 6), toM = to.slice(0, 6);

  const prev = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : { series: {} };
  const out = { fetchedAt: new Date().toISOString().slice(0, 16).replace('T', ' '), keyFrom: k.from, from: from, to: to, series: { ...(prev.series || {}) }, errors: [] };
  for (const s of SERIES) {
    try {
      const rows = await call(k.key, s, s.cycle === 'M' ? fromM : from, s.cycle === 'M' ? toM : to);
      out.series[s.id] = { label: s.label, unit: s.unit, stat: s.stat, items: s.items, cycle: s.cycle, rows };
      console.log(`  ${s.id}: ${rows.length}건 ${rows.length ? rows[0][0] + ' ~ ' + rows[rows.length - 1][0] : ''}`);
    } catch (e) {
      out.errors.push(`${s.id}: ${e.message}`);
      console.log(`  ${s.id}: FAIL ${e.message}`);
    }
    await sleep(350);
  }
  // 하나라도 받았으면 저장. 전부 실패면 옛 캐시를 남긴다.
  const got = Object.values(out.series).some((s) => s.rows && s.rows.length);
  if (!got) { console.log('ECOS FAIL: 받은 계열 없음 — 옛 캐시 유지'); return; }
  fs.writeFileSync(CACHE, JSON.stringify(out), 'utf8');
  console.log(`→ ${path.relative(ROOT, CACHE)} · ${Object.keys(out.series).length}계열 · 오류 ${out.errors.length}건`);
}

main().catch((e) => { console.log('ECOS FAIL:', e.message); }).finally(() => process.exit(0));
