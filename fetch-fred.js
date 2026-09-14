/**
 * fetch-fred.js — 미국 매크로(FRED) → cache/fred.json
 *
 *   node fetch-fred.js            전 계열 (관측 시작 2019-01-01)
 *   node fetch-fred.js --probe    계열 ID 가 실제로 존재하는지만 확인 (관측 1건)
 *
 * 왜: 국내 판(bok-monitor)에 "투자 지표로는 미국 매크로가 더 엄중하다"는 사용자 요청으로 미국 탭을 붙인다.
 *     물가 4종(CPI·PPI·PCE·근원PCE)은 연준 경로와, 생산·고용은 경기 국면, 금리·스프레드·유동성은 위험자산 온도계로 읽는다.
 *
 * 키: 이 폴더 .env 의 FRED_API_KEY, 없으면 `미장 요약/.env` 를 읽기 전용으로 빌려 쓴다(값을 복사해 두지 않는다).
 * 계열 ID 는 코드에 박기 전에 실제 응답으로 확인했다(--probe). 없는 계열은 errors 에 남기고 화면에서 '데이터 없음'.
 * 다음 발표일: series/release → release/dates(realtime_start=오늘) 로 받는다. 주요 월간 지표만.
 * 실패해도 exit 0 — 옛 캐시가 있으면 그걸로 그린다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CACHE = path.join(ROOT, 'cache', 'fred.json');
const BASE = 'https://api.stlouisfed.org/fred';
const START = '2019-01-01';

// group: prices(물가) · fed(연준·기대) · activity(경기) · labor(고용) · rates(금리·스프레드) · liquidity(유동성) · fx(달러·원화) · risk(위험자산)
// kind: level(지수→전년비·전월비 파생) · rate(그대로) · count(고용자수→전월증감) · flow(주간 건수)
const SERIES = [
  // 물가
  { id: 'CPIAUCSL', key: 'cpi', label: 'CPI (전체)', group: 'prices', kind: 'level', freq: 'M', rel: true },
  { id: 'CPILFESL', key: 'core_cpi', label: '근원 CPI', group: 'prices', kind: 'level', freq: 'M' },
  { id: 'PPIFIS', key: 'ppi', label: 'PPI 최종수요', group: 'prices', kind: 'level', freq: 'M', rel: true },
  { id: 'PCEPI', key: 'pce', label: 'PCE 물가', group: 'prices', kind: 'level', freq: 'M', rel: true },
  { id: 'PCEPILFE', key: 'core_pce', label: '근원 PCE', group: 'prices', kind: 'level', freq: 'M' },
  { id: 'CUSR0000SAH1', key: 'cpi_shelter', label: 'CPI 주거(Shelter)', group: 'prices', kind: 'level', freq: 'M' },
  // CPI 구성 (전부 SA, 월)
  { id: 'CPIUFDSL', key: 'cpi_food', label: 'CPI 식료품', group: 'cpi_comp', kind: 'level', freq: 'M' },
  { id: 'CPIENGSL', key: 'cpi_energy', label: 'CPI 에너지', group: 'cpi_comp', kind: 'level', freq: 'M' },
  { id: 'CUSR0000SAF11', key: 'cpi_food_home', label: 'CPI 가정식(식료품)', group: 'cpi_comp', kind: 'level', freq: 'M' },
  { id: 'CUSR0000SEFV', key: 'cpi_food_away', label: 'CPI 외식', group: 'cpi_comp', kind: 'level', freq: 'M' },
  { id: 'CUSR0000SETB01', key: 'cpi_gasoline', label: 'CPI 휘발유', group: 'cpi_comp', kind: 'level', freq: 'M' },
  { id: 'CUSR0000SACL1E', key: 'cpi_core_goods', label: 'CPI 근원 상품', group: 'cpi_comp', kind: 'level', freq: 'M' },
  { id: 'CUSR0000SASLE', key: 'cpi_core_svc', label: 'CPI 근원 서비스(에너지 제외)', group: 'cpi_comp', kind: 'level', freq: 'M' },
  { id: 'CUSR0000SASL2RS', key: 'cpi_svc_ex_shelter', label: 'CPI 서비스(주거임차 제외)', group: 'cpi_comp', kind: 'level', freq: 'M' },
  { id: 'CUSR0000SEHA', key: 'cpi_rent', label: 'CPI 임차료', group: 'cpi_comp', kind: 'level', freq: 'M' },
  { id: 'CUSR0000SEHC', key: 'cpi_oer', label: 'CPI 자가주거비(OER)', group: 'cpi_comp', kind: 'level', freq: 'M' },
  { id: 'CUSR0000SAM2', key: 'cpi_medical_svc', label: 'CPI 의료서비스', group: 'cpi_comp', kind: 'level', freq: 'M' },
  { id: 'CUSR0000SAS4', key: 'cpi_transport_svc', label: 'CPI 교통서비스', group: 'cpi_comp', kind: 'level', freq: 'M' },
  { id: 'CUSR0000SETA01', key: 'cpi_new_cars', label: 'CPI 신차', group: 'cpi_comp', kind: 'level', freq: 'M' },
  { id: 'CUSR0000SETA02', key: 'cpi_used_cars', label: 'CPI 중고차', group: 'cpi_comp', kind: 'level', freq: 'M' },
  // PCE 구성
  { id: 'DFXARG3M086SBEA', key: 'pce_food', label: 'PCE 식료품', group: 'pce_comp', kind: 'level', freq: 'M' },
  { id: 'DNRGRG3M086SBEA', key: 'pce_energy', label: 'PCE 에너지', group: 'pce_comp', kind: 'level', freq: 'M' },
  { id: 'DGDSRG3M086SBEA', key: 'pce_goods', label: 'PCE 상품', group: 'pce_comp', kind: 'level', freq: 'M' },
  { id: 'DSERRG3M086SBEA', key: 'pce_services', label: 'PCE 서비스', group: 'pce_comp', kind: 'level', freq: 'M' },
  { id: 'DDURRG3M086SBEA', key: 'pce_durables', label: 'PCE 내구재', group: 'pce_comp', kind: 'level', freq: 'M' },
  { id: 'DNDGRG3M086SBEA', key: 'pce_nondurables', label: 'PCE 비내구재', group: 'pce_comp', kind: 'level', freq: 'M' },
  { id: 'IA001260M', key: 'pce_supercore', label: 'PCE 슈퍼코어(에너지·주거 제외 서비스)', group: 'pce_comp', kind: 'level', freq: 'M' },
  // PPI 구성 (식품·에너지·상품·서비스는 NSA)
  { id: 'PPIFES', key: 'ppi_core', label: 'PPI 최종수요 식품·에너지 제외', group: 'ppi_comp', kind: 'level', freq: 'M' },
  { id: 'PPIFDF', key: 'ppi_food', label: 'PPI 최종수요 식품 (NSA)', group: 'ppi_comp', kind: 'level', freq: 'M' },
  { id: 'PPIFDE', key: 'ppi_energy', label: 'PPI 최종수요 에너지 (NSA)', group: 'ppi_comp', kind: 'level', freq: 'M' },
  { id: 'PPIFDG', key: 'ppi_goods', label: 'PPI 최종수요 상품 (NSA)', group: 'ppi_comp', kind: 'level', freq: 'M' },
  { id: 'PPIFDS', key: 'ppi_services', label: 'PPI 최종수요 서비스 (NSA)', group: 'ppi_comp', kind: 'level', freq: 'M' },
  // 연준·기대
  { id: 'DFEDTARU', key: 'ffr_upper', label: '연방기금금리 목표 상단', group: 'fed', kind: 'rate', freq: 'D' },
  { id: 'T10YIE', key: 'be10', label: '10년 기대인플레이션(BEI)', group: 'fed', kind: 'rate', freq: 'D' },
  { id: 'T5YIFR', key: 'be5y5y', label: '5년 후 5년 기대인플레이션', group: 'fed', kind: 'rate', freq: 'D' },
  { id: 'DFII10', key: 'real10', label: '10년 실질금리(TIPS)', group: 'fed', kind: 'rate', freq: 'D' },
  // 경기
  { id: 'INDPRO', key: 'indpro', label: '산업생산 지수', group: 'activity', kind: 'level', freq: 'M', rel: true },
  { id: 'TCU', key: 'tcu', label: '설비가동률', group: 'activity', kind: 'rate', freq: 'M' },
  { id: 'RSAFS', key: 'retail', label: '소매판매', group: 'activity', kind: 'level', freq: 'M', rel: true },
  { id: 'DGORDER', key: 'durables', label: '내구재 주문', group: 'activity', kind: 'level', freq: 'M', rel: true },
  { id: 'HOUST', key: 'houst', label: '주택착공 (천호, 연율)', group: 'activity', kind: 'rate', freq: 'M', rel: true },
  { id: 'UMCSENT', key: 'umcsent', label: '미시간대 소비자심리', group: 'activity', kind: 'rate', freq: 'M' },
  { id: 'GDPC1', key: 'gdp', label: '실질 GDP (십억달러, 연율)', group: 'activity', kind: 'level', freq: 'Q', rel: true },
  // 고용
  { id: 'PAYEMS', key: 'payems', label: '비농업 고용자수 (천명)', group: 'labor', kind: 'count', freq: 'M', rel: true },
  { id: 'UNRATE', key: 'unrate', label: '실업률', group: 'labor', kind: 'rate', freq: 'M' },
  { id: 'CES0500000003', key: 'ahe', label: '시간당 평균임금 (달러)', group: 'labor', kind: 'level', freq: 'M' },
  { id: 'CIVPART', key: 'partic', label: '경제활동참가율', group: 'labor', kind: 'rate', freq: 'M' },
  { id: 'ICSA', key: 'claims', label: '신규 실업수당 청구 (주간)', group: 'labor', kind: 'flow', freq: 'W', rel: true },
  { id: 'CCSA', key: 'cont_claims', label: '계속 실업수당 청구 (주간)', group: 'labor', kind: 'flow', freq: 'W' },
  { id: 'JTSJOL', key: 'jolts', label: 'JOLTS 구인건수 (천건)', group: 'labor', kind: 'flow', freq: 'M', rel: true },
  // 금리·스프레드
  { id: 'DGS2', key: 'ust2', label: '미국채 2년', group: 'rates', kind: 'rate', freq: 'D' },
  { id: 'DGS10', key: 'ust10', label: '미국채 10년', group: 'rates', kind: 'rate', freq: 'D' },
  { id: 'DGS30', key: 'ust30', label: '미국채 30년', group: 'rates', kind: 'rate', freq: 'D' },
  { id: 'T10Y2Y', key: 's10y2y', label: '10년−2년 스프레드', group: 'rates', kind: 'rate', freq: 'D' },
  { id: 'T10Y3M', key: 's10y3m', label: '10년−3개월 스프레드', group: 'rates', kind: 'rate', freq: 'D' },
  { id: 'BAMLH0A0HYM2', key: 'hy_oas', label: '하이일드 OAS', group: 'rates', kind: 'rate', freq: 'D' },
  { id: 'BAMLC0A0CM', key: 'ig_oas', label: '투자등급 OAS', group: 'rates', kind: 'rate', freq: 'D' },
  { id: 'SOFR', key: 'sofr', label: 'SOFR', group: 'rates', kind: 'rate', freq: 'D' },
  // 유동성
  { id: 'WALCL', key: 'fed_bs', label: '연준 총자산 (백만달러)', group: 'liquidity', kind: 'level', freq: 'W' },
  { id: 'RRPONTSYD', key: 'rrp', label: '역레포 잔액 (십억달러)', group: 'liquidity', kind: 'level', freq: 'D' },
  { id: 'WTREGEN', key: 'tga', label: '재무부 일반계정 TGA (십억달러)', group: 'liquidity', kind: 'level', freq: 'W' },
  { id: 'M2SL', key: 'm2', label: 'M2 (십억달러)', group: 'liquidity', kind: 'level', freq: 'M' },
  { id: 'NFCI', key: 'nfci', label: '시카고 연은 금융여건지수', group: 'liquidity', kind: 'rate', freq: 'W' },
  // 달러·원화
  { id: 'DTWEXBGS', key: 'dxy_broad', label: '광의 달러지수', group: 'fx', kind: 'level', freq: 'D' },
  { id: 'DEXKOUS', key: 'usdkrw', label: '원/달러 (FRED, 주 단위 지연)', group: 'fx', kind: 'rate', freq: 'D' },
  // 위험자산
  { id: 'VIXCLS', key: 'vix', label: 'VIX', group: 'risk', kind: 'rate', freq: 'D' },
  { id: 'SP500', key: 'sp500', label: 'S&P 500', group: 'risk', kind: 'level', freq: 'D' },
  { id: 'DCOILWTICO', key: 'wti', label: 'WTI 유가 (달러/배럴)', group: 'energy', kind: 'level', freq: 'D' },
  { id: 'DCOILBRENTEU', key: 'brent', label: '브렌트유 (달러/배럴)', group: 'energy', kind: 'level', freq: 'D' },
  { id: 'POILDUBUSDM', key: 'dubai_m', label: '두바이유 월평균 (IMF, 달러/배럴)', group: 'energy', kind: 'level', freq: 'M' },
  { id: 'POILBREUSDM', key: 'brent_m', label: '브렌트유 월평균 (IMF, 달러/배럴)', group: 'energy', kind: 'level', freq: 'M' },
  { id: 'POILWTIUSDM', key: 'wti_m', label: 'WTI 월평균 (IMF, 달러/배럴)', group: 'energy', kind: 'level', freq: 'M' },
  { id: 'DHHNGSP', key: 'natgas', label: '헨리허브 천연가스 (달러/MMBtu)', group: 'energy', kind: 'level', freq: 'D' },
  { id: 'GASREGW', key: 'gasoline', label: '미국 휘발유 소매가 (달러/갤런, 주간)', group: 'energy', kind: 'level', freq: 'W' },
];

function arg(name) { return process.argv.slice(2).includes(`--${name}`); }
function readKey() {
  if (process.env.FRED_API_KEY) return { key: process.env.FRED_API_KEY.trim(), from: 'env (GitHub Actions secret)' };
  const cands = [path.join(ROOT, '.env'), path.join(ROOT, '..', '..', '미장 요약', '.env')];
  for (const f of cands) {
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, 'utf8').match(/^\s*FRED_API_KEY\s*=\s*"?([^"\s#]+)/m);
    if (m) return { key: m[1], from: path.relative(ROOT, f) };
  }
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(key, ep, params) {
  const q = new URLSearchParams({ api_key: key, file_type: 'json', ...params });
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 25000);
  try {
    const res = await fetch(`${BASE}/${ep}?${q}`, { signal: ac.signal });
    const text = await res.text();
    if (!res.ok) { let msg = text.slice(0, 120); try { msg = JSON.parse(text).error_message || msg; } catch { /* 본문 그대로 */ } throw new Error(`HTTP ${res.status} ${msg}`); }
    return JSON.parse(text);
  } finally { clearTimeout(t); }
}

async function main() {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const k = readKey();
  if (!k) { console.log('FRED SKIP: FRED_API_KEY 없음 (.env)'); return; }
  const probe = arg('probe');
  const prev = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  const out = { fetchedAt: new Date().toISOString().slice(0, 16).replace('T', ' '), keyFrom: k.from, start: START, series: { ...(prev.series || {}) }, releases: { ...(prev.releases || {}) }, errors: [] };
  const relIds = { ...(prev.relIds || {}) };
  for (const s of SERIES) {
    try {
      const j = await get(k.key, 'series/observations', { series_id: s.id, observation_start: probe ? '2026-01-01' : START, ...(probe ? { limit: 3, sort_order: 'desc' } : {}) });
      const rows = (j.observations || []).map((o) => [o.date, o.value === '.' ? null : Number(o.value)]).filter((r) => r[1] != null && Number.isFinite(r[1]));
      if (!rows.length) throw new Error('관측값 없음');
      if (!probe) out.series[s.key] = { id: s.id, label: s.label, unit: s.unit || '', group: s.group, kind: s.kind, freq: s.freq, rows };
      console.log(`  ${s.key} (${s.id}): ${rows.length}건 ~ ${rows[rows.length - 1][0]} = ${rows[rows.length - 1][1]}`);
      if (s.rel && !probe && !relIds[s.id]) {
        const r = await get(k.key, 'series/release', { series_id: s.id });
        const rel = (r.releases || [])[0]; if (rel) relIds[s.id] = { id: rel.id, name: rel.name };
        await sleep(250);
      }
    } catch (e) { out.errors.push(`${s.key} ${s.id}: ${e.message}`); console.log(`  ${s.key} (${s.id}): FAIL ${e.message}`); }
    await sleep(300);
  }
  if (probe) { console.log(`probe 끝 · 오류 ${out.errors.length}건`); return; }
  // 다음 발표일 — 발표(release)마다 한 번
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  for (const s of SERIES.filter((x) => x.rel && relIds[x.id])) {
    const rel = relIds[s.id]; if (seen.has(rel.id)) continue; seen.add(rel.id);
    try {
      const j = await get(k.key, 'release/dates', { release_id: rel.id, realtime_start: today, include_release_dates_with_no_data: 'true', sort_order: 'asc', limit: 3 });
      const dates = (j.release_dates || []).map((d) => d.date).filter((d) => d >= today);
      out.releases[rel.id] = { name: rel.name, next: dates[0] || null, upcoming: dates };
      console.log(`  release ${rel.name}: next ${dates[0] || '—'}`);
    } catch (e) { out.errors.push(`release ${rel.name}: ${e.message}`); }
    await sleep(300);
  }
  out.relIds = relIds;
  for (const s of SERIES) if (out.series[s.key] && relIds[s.id]) out.series[s.key].release = relIds[s.id].id;
  const got = Object.values(out.series).some((s) => s.rows && s.rows.length);
  if (!got) { console.log('FRED FAIL: 받은 계열 없음 — 옛 캐시 유지'); return; }
  fs.writeFileSync(CACHE, JSON.stringify(out), 'utf8');
  console.log(`→ ${path.relative(ROOT, CACHE)} · ${Object.keys(out.series).length}계열 · 오류 ${out.errors.length}건`);
}
main().catch((e) => console.log('FRED FAIL:', e.message)).finally(() => process.exit(0));
