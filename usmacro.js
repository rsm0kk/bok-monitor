/* ───────── 미국 매크로 탭 (FRED) — build.js 가 template.html 의 US 매크로 자리표시자에 이 파일을 그대로 넣는다 ───────── */
const F = DATA.fred && DATA.fred.series ? DATA.fred.series : null;
const FR = DATA.fred && DATA.fred.releases ? DATA.fred.releases : {};
const fs_ = (k) => (F && F[k] && F[k].rows) ? F[k].rows : [];
const fLast = (k, n = 0) => { const r = fs_(k); return r.length > n ? r[r.length - 1 - n] : null; };
/* 파생 계열 */
const yoyRows = (rows, lag = 12) => rows.map((r, i) => [r[0], i >= lag && rows[i - lag][1] ? (r[1] / rows[i - lag][1] - 1) * 100 : null]).filter((r) => r[1] != null);
const momRows = (rows) => rows.map((r, i) => [r[0], i >= 1 && rows[i - 1][1] ? (r[1] / rows[i - 1][1] - 1) * 100 : null]).filter((r) => r[1] != null);
const ann3Rows = (rows) => rows.map((r, i) => [r[0], i >= 3 && rows[i - 3][1] ? (Math.pow(r[1] / rows[i - 3][1], 4) - 1) * 100 : null]).filter((r) => r[1] != null);
const annQRows = (rows) => rows.map((r, i) => [r[0], i >= 1 && rows[i - 1][1] ? (Math.pow(r[1] / rows[i - 1][1], 4) - 1) * 100 : null]).filter((r) => r[1] != null);
const diffRows = (rows) => rows.map((r, i) => [r[0], i >= 1 ? r[1] - rows[i - 1][1] : null]).filter((r) => r[1] != null);
const avgRows = (rows, n) => rows.map((r, i) => [r[0], i >= n - 1 ? mean(rows.slice(i - n + 1, i + 1).map((x) => x[1])) : null]).filter((r) => r[1] != null);
const scaleRows = (rows, k) => rows.map((r) => [r[0], r[1] * k]);
const idxRows = (rows, from) => { const b = rows.find((r) => r[0] >= from); return b ? rows.filter((r) => r[0] >= from).map((r) => [r[0], r[1] / b[1] * 100]) : []; };
const since = (rows, from) => rows.filter((r) => r[0] >= from);
/* 서로 다른 날짜의 계열을 한 x 축에 맞춘다(없는 날은 null) */
function align(...lists) {
  const x = [...new Set(lists.flat().map((r) => r[0]))].sort();
  return { x, cols: lists.map((rows) => { const m = new Map(rows); return x.map((d) => m.has(d) ? m.get(d) : null); }) };
}
const Y = DATA.yahoo && DATA.yahoo.series ? DATA.yahoo.series : null;
/* FRED 계열 뒤에 야후 최신치를 붙인다(점선). 겹치는 날짜는 FRED 값을 쓴다. 야후가 없으면 FRED 만. */
function withY(key) {
  const base = fs_(key); const y = Y && Y[key]; if (!y || !y.rows.length) return { rows: base, extFrom: null };
  const lastD = base.length ? base[base.length - 1][0] : '0000'; const add = y.rows.filter((r) => r[0] > lastD);
  if (!add.length) return { rows: base, extFrom: null };
  return { rows: base.concat(add), extFrom: base.length - 1 };
}
const yLast = (key) => { const y = Y && Y[key]; return y && y.rows.length ? y.rows[y.rows.length - 1] : null; };
const relNext = (k) => { const s = F && F[k]; const r = s && s.release != null ? FR[s.release] : null; return r ? r.next : null; };
const usM = (d) => d ? `${d.slice(0, 4)}.${+d.slice(5, 7)}` : '—';

function usKpis() {
  if (!F) return [];
  const yoyLast = (k) => { const y = yoyRows(fs_(k)); return y.length ? { d: y[y.length - 1][0], v: y[y.length - 1][1], p: y.length > 1 ? y[y.length - 2][1] : null } : null; };
  const rateLast = (k) => { const r = fs_(k); return r.length ? { d: r[r.length - 1][0], v: r[r.length - 1][1], p: r.length > 1 ? r[r.length - 2][1] : null } : null; };
  const k = [];
  const push = (l, o, unit, d, opts = {}) => { if (!o) return; const diff = o.p != null ? o.v - o.p : null; const yl = opts.y ? yLast(opts.y) : null; const yv = yl && yl[0] > o.d ? yl : null; k.push({ l, v: yv ? `${fmt(yv[1], d)}<small>${unit} · 야후 ${xlab(yv[0], true)}</small>` : `${opts.signed ? sgn(o.v, d) : fmt(o.v, d)}<small>${unit}</small>`, s: `FRED ${opts.monthly ? usM(o.d) : xlab(o.d, true)} ${opts.signed ? sgn(o.v, d) : fmt(o.v, d)} · 직전 ${opts.signed ? sgn(o.p, d) : fmt(o.p, d)} <span class="${tone(diff)}">${sgn(diff, d)}</span>` }); };
  push('연방기금금리 상단', rateLast('ffr_upper'), '%', 2);
  push('CPI (전년비)', yoyLast('cpi'), '%', 1, { monthly: true });
  push('근원 CPI (전년비)', yoyLast('core_cpi'), '%', 1, { monthly: true });
  push('PCE (전년비)', yoyLast('pce'), '%', 1, { monthly: true });
  push('근원 PCE (전년비)', yoyLast('core_pce'), '%', 1, { monthly: true });
  push('PPI 최종수요 (전년비)', yoyLast('ppi'), '%', 1, { monthly: true });
  const pc = diffRows(fs_('payems')); if (pc.length) push('비농업 고용 증감', { d: pc[pc.length - 1][0], v: pc[pc.length - 1][1], p: pc[pc.length - 2][1] }, '천명', 0, { monthly: true, signed: true });
  push('실업률', rateLast('unrate'), '%', 1, { monthly: true });
  push('미국채 10년', rateLast('ust10'), '%', 2, { y: 'ust10' });
  push('10년−2년 스프레드', rateLast('s10y2y'), '%p', 2, { signed: true });
  push('하이일드 OAS', rateLast('hy_oas'), '%p', 2);
  push('10년 실질금리', rateLast('real10'), '%', 2);
  push('광의 달러지수', rateLast('dxy_broad'), '', 1);
  push('VIX', rateLast('vix'), '', 1, { y: 'vix' });
  push('브렌트유', rateLast('brent'), '$', 1, { y: 'brent' });
  push('WTI', rateLast('wti'), '$', 1, { y: 'wti' });
  return k;
}

R.usmacro = (sec) => {
  const g = document.createElement('div'); g.className = 'grid'; sec.appendChild(g);
  if (!F) { const c = document.createElement('div'); c.className = 'card'; c.dataset.region = 'global'; c.innerHTML = '<h3>미국 매크로</h3><div class="empty">FRED 미연동 — cache/fred.json 이 없습니다. .env 의 FRED 키를 확인하고 node fetch-fred.js 를 실행하세요.</div>'; g.appendChild(c); return; }
  const G = (o) => { if (o.chartCfg && !o.chartCfg.extLabel) o.chartCfg.extLabel = 'FRED 이후 야후 파이낸스 최신치 (선물·지수, 비공식)'; return card(g, { region: 'global', ...o }); };
  // KPI
  const kc = document.createElement('div'); kc.className = 'card'; kc.dataset.region = 'global';
  kc.innerHTML = `<h3>미국 핵심 지표 — 최근치와 직전치</h3><div class="src">FRED (세인트루이스 연은) · ${esc(DATA.fred.fetchedAt)} 수집 · 월간 지표는 기준월, 일간 지표는 날짜</div><div class="kpis">${usKpis().map((t) => `<div class="kpi"><div class="l">${t.l}</div><div class="v">${t.v}</div><div class="s">${t.s}</div></div>`).join('')}</div>`;
  g.appendChild(kc);
  // 국면 읽기 (규칙 기반)
  const read = [];
  const cy = yoyRows(fs_('core_pce')), ca = ann3Rows(fs_('core_pce'));
  if (cy.length && ca.length) { const y = cy[cy.length - 1][1], a = ca[ca.length - 1][1]; read.push(`물가: 근원 PCE 전년비 ${fmt(y, 1)}% (목표 2% 대비 ${sgn(y - 2, 1)}%p), 최근 3개월 연율 ${fmt(a, 1)}% → ${a > y + 0.3 ? '재가속' : a < y - 0.3 ? '감속' : '횡보'} (${usM(cy[cy.length - 1][0])} 기준)`); }
  const pc3 = avgRows(diffRows(fs_('payems')), 3), ur = fs_('unrate');
  if (pc3.length && ur.length) { const u12 = Math.min(...ur.slice(-12).map((r) => r[1])); read.push(`고용: 비농업 고용 3개월 평균 ${sgn(pc3[pc3.length - 1][1], 0)}천명/월, 실업률 ${fmt(ur[ur.length - 1][1], 1)}% (12개월 최저 ${fmt(u12, 1)}% 대비 ${sgn(ur[ur.length - 1][1] - u12, 1)}%p)`); }
  const s2 = fLast('s10y2y'), hy = fs_('hy_oas'), r10 = fs_('real10');
  if (s2) read.push(`커브: 10년−2년 ${sgn(s2[1], 2)}%p (${s2[1] >= 0 ? '정상' : '역전'})`);
  if (hy.length > 250) { const med = median(hy.slice(-250).map((r) => r[1])); read.push(`크레딧: 하이일드 OAS ${fmt(hy[hy.length - 1][1], 2)}%p, 1년 중앙값 ${fmt(med, 2)}%p 대비 ${sgn(hy[hy.length - 1][1] - med, 2)}%p → ${hy[hy.length - 1][1] > med + 0.5 ? '경계' : '완화'}`); }
  if (r10.length > 63) read.push(`실질금리: 10년 TIPS ${fmt(r10[r10.length - 1][1], 2)}%, 3개월 전 대비 ${sgn(r10[r10.length - 1][1] - r10[r10.length - 64][1], 2)}%p ${r10[r10.length - 1][1] > r10[r10.length - 64][1] ? '상승(밸류 부담)' : '하락(밸류 우호)'}`);
  const br = yLast('brent') || fLast('brent'), wt0 = yLast('wti') || fLast('wti');
  if (br) read.push(`유가: 브렌트 ${fmt(br[1], 1)}달러 (${xlab(br[0], true)}${yLast('brent') ? ', 야후 선물' : ''}) — 한국은행 8월 전제(2026 하반기 84달러, 비관 95달러) 대비 ${sgn(br[1] - 84, 1)}달러${wt0 ? `, WTI ${fmt(wt0[1], 1)}달러, 브렌트−WTI ${sgn(br[1] - wt0[1], 1)}` : ''}`);
  const ffr = fLast('ffr_upper'), fx = fLast('usdkrw');
  const krBase = (ecosLast('base_rate') || B.baseRateLast); if (ffr && krBase) read.push(`한미 금리차: 한국 ${fmt(krBase.v != null ? krBase.v : krBase.rate, 2)}% − 미국 상단 ${fmt(ffr[1], 2)}% = ${sgn((krBase.v != null ? krBase.v : krBase.rate) - ffr[1], 2)}%p`);
  const rc = document.createElement('div'); rc.className = 'card c6'; rc.dataset.region = 'global';
  rc.innerHTML = `<h3>국면 읽기 — 규칙 기반 (예측 아님)</h3><div class="src">숫자에 이름만 붙인 것. 기준: 근원 PCE 3개월 연율 vs 전년비 ±0.3%p, HY OAS 1년 중앙값 +0.5%p, 실질금리 3개월 방향</div><ul class="list">${read.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
  g.appendChild(rc);
  // 발표 캘린더
  const cal = [['cpi', 'CPI', 'yoy'], ['ppi', 'PPI', 'yoy'], ['pce', 'PCE / 근원 PCE', 'yoy'], ['payems', '비농업 고용', 'diff'], ['claims', '신규 실업수당 청구', 'lvl'], ['jolts', 'JOLTS 구인', 'lvl'], ['retail', '소매판매', 'mom'], ['indpro', '산업생산', 'mom'], ['durables', '내구재 주문', 'mom'], ['houst', '주택착공', 'lvl'], ['gdp', '실질 GDP (연율)', 'annq']];
  const cc = document.createElement('div'); cc.className = 'card c6'; cc.dataset.region = 'global';
  cc.innerHTML = `<h3>발표 캘린더 — 최근치·직전치·다음 발표일</h3><div class="src">FRED release/dates · 컨센서스는 FRED 에 없어 싣지 않는다</div><div class="tbl"><table><thead><tr><th class="tl">지표</th><th class="tl">기준</th><th>최근</th><th>직전</th><th class="tl">다음 발표</th></tr></thead><tbody>${cal.map(([k, l, m]) => {
    const rows = fs_(k); if (!rows.length) return '';
    const d = m === 'yoy' ? yoyRows(rows) : m === 'mom' ? momRows(rows) : m === 'diff' ? diffRows(rows) : m === 'annq' ? annQRows(rows) : rows;
    if (!d.length) return '';
    const L = d[d.length - 1], P = d[d.length - 2] || [null, null]; const unit = m === 'yoy' ? '% y/y' : m === 'mom' ? '% m/m' : m === 'diff' ? '천명' : m === 'annq' ? '% 연율' : (F[k].label.match(/\((.*?)\)/) || [])[1] || '';
    const dec = m === 'lvl' ? 0 : 1; const signed = m !== 'lvl';
    return `<tr><td class="tl">${esc(l)}</td><td class="tl">${esc(usM(L[0]))} ${esc(unit)}</td>${tdN(L[1], dec, signed)}${tdN(P[1], dec, signed)}<td class="tl">${esc(relNext(k) || '—')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
  g.appendChild(cc);
  // 물가
  const P = align(yoyRows(fs_('cpi')), yoyRows(fs_('core_cpi')), yoyRows(fs_('pce')), yoyRows(fs_('core_pce')));
  G({ ranges: true, title: '물가 4종 — 전년동월비', src: 'FRED CPIAUCSL·CPILFESL·PCEPI·PCEPILFE · %', cls: 'c6', chartCfg: { freq: 'M', x: P.x, series: [{ label: 'CPI', values: P.cols[0], unit: '%', color: C.red, width: 2 }, { label: '근원 CPI', values: P.cols[1], unit: '%', color: C.orange, width: 2 }, { label: 'PCE', values: P.cols[2], unit: '%', color: C.blue, width: 2 }, { label: '근원 PCE', values: P.cols[3], unit: '%', color: C.navy, width: 2.4 }], refs: [{ y: 2, label: '연준 목표 2%' }], dec: 1, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  const A = align(ann3Rows(fs_('core_cpi')), ann3Rows(fs_('core_pce')), yoyRows(fs_('core_pce')));
  G({ ranges: true, title: '근원 물가 — 3개월 연율 vs 전년비 (재가속 여부)', src: 'FRED · % · 3개월 연율이 전년비보다 높으면 재가속', cls: 'c6', chartCfg: { freq: 'M', x: A.x, series: [{ label: '근원 CPI 3개월 연율', values: A.cols[0], unit: '%', color: C.orange }, { label: '근원 PCE 3개월 연율', values: A.cols[1], unit: '%', color: C.blue, width: 2 }, { label: '근원 PCE 전년비', values: A.cols[2], unit: '%', color: C.navy, width: 2.4 }], refs: [{ y: 2, label: '2%' }], dec: 1, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  const PP = align(yoyRows(fs_('ppi')), yoyRows(fs_('cpi_shelter')));
  G({ ranges: true, title: 'PPI 최종수요 · CPI 주거 — 전년비', src: 'FRED PPIFIS·CUSR0000SAH1 · % · 주거는 CPI 의 1/3, 후행', cls: 'c6', chartCfg: { freq: 'M', x: PP.x, series: [{ label: 'PPI 최종수요', values: PP.cols[0], unit: '%', color: C.purple, width: 2 }, { label: 'CPI 주거(Shelter)', values: PP.cols[1], unit: '%', color: C.teal, width: 2 }], zero: true, dec: 1, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  const M = align(momRows(fs_('cpi')), momRows(fs_('core_cpi')));
  G({ title: 'CPI · 근원 CPI — 전월비', src: 'FRED · % m/m · 0.2% ≈ 연 2.4%', cls: 'c6', chartCfg: { x: M.x.slice(-36), series: [{ type: 'bar', label: 'CPI m/m', values: M.cols[0].slice(-36), unit: '%', color: C.red, signed: true }, { type: 'bar', label: '근원 CPI m/m', values: M.cols[1].slice(-36), unit: '%', color: C.orange, signed: true }], dec: 2, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  // ── 구성별 점도표 (식료품·에너지·근원 상품·서비스) ──
  const compSets = [
    { name: 'CPI', keys: [['cpi', '헤드라인', C.navy], ['core_cpi', '근원', C.red], ['cpi_food', '식료품', C.green], ['cpi_energy', '에너지', C.gold], ['cpi_core_goods', '근원 상품', C.purple], ['cpi_core_svc', '근원 서비스', C.orange], ['cpi_shelter', '주거', C.teal], ['cpi_svc_ex_shelter', '서비스(주거임차 제외)', C.pink]], src: 'FRED CPI 구성 계열 (SA)' },
    { name: 'PCE', keys: [['pce', '헤드라인', C.navy], ['core_pce', '근원', C.red], ['pce_food', '식료품', C.green], ['pce_energy', '에너지', C.gold], ['pce_goods', '상품', C.purple], ['pce_services', '서비스', C.orange], ['pce_supercore', '슈퍼코어(에너지·주거 제외 서비스)', C.pink]], src: 'FRED PCE 구성 계열 (SA)' },
    { name: 'PPI', keys: [['ppi', '최종수요 헤드라인', C.navy], ['ppi_core', '식품·에너지 제외', C.red], ['ppi_food', '식품 (NSA)', C.green], ['ppi_energy', '에너지 (NSA)', C.gold], ['ppi_goods', '상품 (NSA)', C.purple], ['ppi_services', '서비스 (NSA)', C.orange]], src: 'FRED PPI 최종수요 구성 · 식품·에너지·상품·서비스는 비계절조정이라 전월비 변동이 크다' },
  ];
  const compCard = document.createElement('div'); compCard.className = 'card'; compCard.dataset.region = 'global';
  compCard.innerHTML = `<h3>물가 구성별 히트맵 — 식료품·에너지·근원 상품·서비스 (최근 13개월)</h3><div class="src">셀 = 그 달의 값, 색 진하기는 전월비 ±1.0%·전년비 ±6%·3개월 연율 ±6% 에서 포화 · 셀 위에 올리면 지수 원값 · '—' 는 FRED 에 관측이 없는 달(미발표), '*' 는 직전 달이 비어 2개월 변화 · 헤더 클릭 정렬</div><div class="toolbar">${compSets.map((c, i) => `<button type="button" class="btn${i === 0 ? ' on' : ''}" data-cs="${i}">${c.name}</button>`).join('')}<span class="sp"></span>${[['mom', '전월비 %'], ['ann3', '3개월 연율 %'], ['yoy', '전년비 %']].map(([k, l], i) => `<button type="button" class="btn${i === 0 ? ' on' : ''}" data-mode="${k}">${l}</button>`).join('')}</div><div class="tbl heat" data-h="grid"></div><div style="margin-top:10px" data-h="yy"></div>`;
  g.appendChild(compCard);
  const drawComp = () => {
    const ci = +$('.btn.on[data-cs]', compCard).dataset.cs, mode = $('.btn.on[data-mode]', compCard).dataset.mode;
    const c = compSets[ci]; const have = c.keys.filter(([k]) => fs_(k).length);
    const tf = mode === 'mom' ? momRows : mode === 'ann3' ? ann3Rows : yoyRows;
    const cap = mode === 'mom' ? 1.0 : 6, dec = mode === 'mom' ? 2 : 1;
    const G2 = align(...have.map(([k]) => tf(fs_(k)))); const n = G2.x.length, from = Math.max(0, n - 13);
    // 달력 기준으로 빈 달을 채운다 — FRED 에 관측이 없는 달(예: 2025-10 CPI 미발표)은 '—' 로 두고, 그 다음 달 전월비는 2개월 변화라고 표시
    const cols = []; { const a = G2.x[from], b = G2.x[n - 1]; for (let y = +a.slice(0, 4), m = +a.slice(5, 7); ; m++) { if (m > 12) { m = 1; y++; } const d = `${y}-${String(m).padStart(2, '0')}-01`; if (d > b) break; cols.push(d); } }
    const lv = have.map(([k]) => new Map(fs_(k)));
    const prevMonth = (d) => { let y = +d.slice(0, 4), m = +d.slice(5, 7) - 1; if (m < 1) { m = 12; y--; } return `${y}-${String(m).padStart(2, '0')}-01`; };
    const gapAfter = have.map(([k]) => { const r = fs_(k); const set = new Set(); for (let i = 1; i < r.length; i++) if (r[i - 1][0] !== prevMonth(r[i][0])) set.add(r[i][0]); return set; });
    const colIdx = new Map(G2.x.map((d, i) => [d, i]));
    $('[data-h="grid"]', compCard).innerHTML = `<table><thead><tr><th>구성</th>${cols.map((d) => `<th>${esc(xlab(d.slice(0, 7), true))}</th>`).join('')}<th>${mode === 'mom' ? '3M 연율' : '최근 m/m'}</th><th>y/y</th></tr></thead><tbody>${have.map(([k, l], j) => {
      const mm = momRows(fs_(k)), a3 = ann3Rows(fs_(k)), yy = yoyRows(fs_(k)); const L = (a) => a.length ? a[a.length - 1][1] : null;
      return `<tr><td>${esc(l)}</td>${cols.map((d) => { const gi = colIdx.get(d); const v = gi == null ? null : G2.cols[j][gi]; const raw = lv[j].get(d); const gap = mode === 'mom' && gapAfter[j].has(d); return `<td data-v="${v == null ? '' : v}" style="${heatColor(v, cap)}" title="${esc(l)} ${esc(usM(d))} ${raw == null ? 'FRED 관측 없음(미발표)' : '지수 ' + fmt(raw, 2)}${gap ? ' · 직전 달 관측이 없어 2개월 변화' : ''}">${v == null ? '—' : sgn(v, dec)}${gap ? '*' : ''}</td>`; }).join('')}${tdN(mode === 'mom' ? L(a3) : L(mm), mode === 'mom' ? 1 : 2, true)}${tdN(L(yy), 1, true)}</tr>`;
    }).join('')}</tbody></table>`;
    makeSortable($('table', compCard));
    $$('td[title]', compCard).forEach((td) => { td.addEventListener('mousemove', (e) => showTip(e.clientX, e.clientY, esc(td.title))); td.addEventListener('mouseleave', hideTip); });
    const YY = align(...have.map(([k]) => yoyRows(fs_(k))));
    chart($('[data-h="yy"]', compCard), { title: c.name + ' 구성별 전년비', x: YY.x, series: have.map(([k, l, col], j) => ({ label: l, values: YY.cols[j], unit: '% y/y', color: col, width: j < 2 ? 2.2 : 1.4 })), zero: true, dec: 1, height: 240, minWidth: 460, xfmt: (d) => xlab(d.slice(0, 7), true), src: c.src });
  };
  $$('.btn[data-cs], .btn[data-mode]', compCard).forEach((b) => b.addEventListener('click', () => { const attr = b.dataset.cs != null ? 'data-cs' : 'data-mode'; $$(`.btn[${attr}]`, compCard).forEach((x) => x.classList.toggle('on', x === b)); drawComp(); }));
  drawComp();
  // ── 컨센서스 대비 서프라이즈 ──
  const CS = DATA.consensus; const evs = CS ? Object.values(CS.events).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const done = evs.filter((e) => e.actual != null), todo = evs.filter((e) => e.actual == null);
  const vb = (v) => v === '상회' ? `<span class="badge warn">상회</span>` : v === '하회' ? `<span class="badge" style="background:rgba(23,92,211,.12);color:var(--down)">하회</span>` : v === '보합' ? `<span class="badge gray">보합</span>` : '';
  const fdec = (f) => { const m = String(f).match(/\.(\d+)/); return m ? m[1].length : 0; };
  const csc = document.createElement('div'); csc.className = 'card'; csc.dataset.region = 'global';
  csc.innerHTML = `<h3>컨센서스 대비 — 상회 · 보합 · 하회</h3><div class="src">예상치·이전치: ForexFactory 주간 캘린더(비공식, 이번 주만 공개) · 실제치: FRED · ${CS ? `스냅샷 ${esc(CS.fetchedAt)} · 기록 시작 ${esc(CS.since)}` : '미수집'}</div>
  <div class="note">배치가 매일 그 주의 예상치를 저장하고, 발표 뒤 FRED 에 새 관측이 올라오면 예상치와 같은 자릿수로 반올림해 판정한다. 컨센서스 기록은 ${CS ? esc(CS.since) : '도입일'} 이후부터 쌓이고 과거는 소급하지 않는다. FRED 에 없는 지표(핵심 소매판매, 지역 연은 지수 등)는 예상치만 보이고 판정은 '—'.</div>
  <div class="two"><div><h4 style="margin:6px 0">판정 기록 (${done.length}건)</h4><div class="tbl" style="max-height:420px"><table><thead><tr><th class="tl">발표(미 동부)</th><th class="tl">지표</th><th>컨센</th><th>실제</th><th>이전</th><th class="tl">판정</th></tr></thead><tbody>${done.length ? done.slice().reverse().map((e) => `<tr><td class="tl">${esc(e.date.replace('T', ' '))}</td><td class="tl">${esc(e.title)}</td><td>${esc(e.forecast)}</td>${tdN(e.actual, fdec(e.forecast))}<td>${esc(e.previous)}</td><td class="tl">${vb(e.verdict)}</td></tr>`).join('') : `<tr><td class="tl" colspan="6" style="white-space:normal;color:var(--ink-3)">아직 판정된 발표가 없다. 첫 판정은 ${todo.find((e) => e.mapped) ? esc(todo.find((e) => e.mapped).date.replace('T', ' ')) + ' ' + esc(todo.find((e) => e.mapped).title) : '다음 스냅샷'} 발표 다음 배치에서.</td></tr>`}</tbody></table></div></div>
  <div><h4 style="margin:6px 0">예정 (${todo.length}건)</h4><div class="tbl" style="max-height:420px"><table><thead><tr><th class="tl">발표(미 동부)</th><th class="tl">지표</th><th class="tl">중요도</th><th>컨센</th><th>이전</th><th class="tl">판정 가능</th></tr></thead><tbody>${todo.map((e) => `<tr><td class="tl">${esc(e.date.replace('T', ' '))}</td><td class="tl">${esc(e.title)}</td><td class="tl">${esc(e.impact)}</td><td>${esc(e.forecast)}</td><td>${esc(e.previous)}</td><td class="tl">${e.mapped ? '<span class="badge">FRED</span>' : '—'}</td></tr>`).join('') || '<tr><td colspan="6" class="tl">예정 없음</td></tr>'}</tbody></table></div></div></div>
  <div data-h="dots" style="margin-top:10px"></div>`;
  g.appendChild(csc);
  // 서프라이즈 점도표 — 지표별, 판정 기록이 있을 때만
  const titles = [...new Set(done.map((e) => e.title))];
  const dotsHost = $('[data-h="dots"]', csc);
  if (titles.length) {
    dotsHost.innerHTML = `<div class="toolbar"><span class="ref">서프라이즈 점도표 — 지표 선택</span><select class="sel" data-h="sel">${titles.map((t) => `<option>${esc(t)}</option>`).join('')}</select></div><div data-h="dc"></div>`;
    const pn = (v) => { const m = String(v).match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
    const drawDots = (t) => {
      const rows = done.filter((e) => e.title === t);
      chart($('[data-h="dc"]', dotsHost), { title: t + ' 서프라이즈', x: rows.map((e) => e.date.slice(0, 10)), series: [{ label: '컨센서스', values: rows.map((e) => pn(e.forecast)), unit: rows[0].unit || '', color: C.gray, noLine: true, hollow: true }, { label: '이전치', values: rows.map((e) => pn(e.previous)), unit: rows[0].unit || '', color: C.teal, noLine: true, hollow: true }, { label: '실제', values: rows.map((e) => e.actual), unit: rows[0].unit || '', color: C.red, noLine: true }], zero: true, dec: 2, height: 220, minWidth: 460, src: '실제(빨강)가 컨센(회색 빈 점) 위면 상회' });
    };
    $('[data-h="sel"]', dotsHost).addEventListener('change', (e) => drawDots(e.target.value)); drawDots(titles[0]);
  } else dotsHost.innerHTML = '<div class="note">서프라이즈 점도표(실제·컨센·이전 점)는 판정 기록이 생기면 여기에 지표별로 그려진다.</div>';
  // 연준·기대
  const u10 = withY('ust10'); const R1 = align(fs_('ffr_upper'), fs_('ust2'), u10.rows);
  G({ title: '연방기금금리 상단 · 미국채 2년 · 10년', src: 'FRED DFEDTARU·DGS2·DGS10 · % · 10년은 야후(^TNX)로 당일까지 연장(점선) · 2년물이 정책금리 아래면 시장은 인하를 본다', cls: 'c6', ranges: true, chartCfg: { x: R1.x, series: [{ label: '연방기금 상단', values: R1.cols[0], unit: '%', color: C.navy, width: 2.4 }, { label: '미국채 2년', values: R1.cols[1], unit: '%', color: C.orange, width: 1.8 }, { label: '미국채 10년', values: R1.cols[2], unit: '%', color: C.red, width: 1.8, extFrom: u10.extFrom != null ? R1.x.indexOf(u10.rows[u10.extFrom][0]) : null }], dec: 2, height: 240 } });
  const R2 = align(fs_('be10'), fs_('be5y5y'), fs_('real10'));
  G({ title: '기대인플레이션(BEI) · 실질금리(TIPS)', src: 'FRED T10YIE·T5YIFR·DFII10 · % · 명목 10년 = 실질 + 기대인플레', cls: 'c6', ranges: true, chartCfg: { x: R2.x, series: [{ label: '10년 BEI', values: R2.cols[0], unit: '%', color: C.red, width: 2 }, { label: '5년 후 5년 BEI', values: R2.cols[1], unit: '%', color: C.orange }, { label: '10년 실질금리', values: R2.cols[2], unit: '%', color: C.blue, width: 2 }], refs: [{ y: 2, label: '2%' }], dec: 2, height: 240 } });
  // 경기
  const E1 = align(yoyRows(fs_('indpro')), yoyRows(fs_('retail')), yoyRows(fs_('durables')));
  G({ ranges: true, title: '산업생산 · 소매판매 · 내구재 주문 — 전년비', src: 'FRED INDPRO·RSAFS·DGORDER · % · 소매·내구재는 명목', cls: 'c6', chartCfg: { freq: 'M', x: E1.x, series: [{ label: '산업생산', values: E1.cols[0], unit: '%', color: C.navy, width: 2.2 }, { label: '소매판매(명목)', values: E1.cols[1], unit: '%', color: C.red }, { label: '내구재 주문(명목)', values: E1.cols[2], unit: '%', color: C.gray }], zero: true, dec: 1, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  const gq = annQRows(fs_('gdp'));
  G({ title: '실질 GDP — 전기비 연율', src: 'FRED GDPC1 · % · 분기', cls: 'c6', chartCfg: { x: gq.map((r) => r[0]), series: [{ type: 'bar', label: 'GDP 전기비 연율', values: gq.map((r) => r[1]), unit: '%', color: C.navy, colorAt: (i, v) => v >= 0 ? C.navy : C.blue, signed: true }], dec: 1, height: 240, xfmt: (d) => `${d.slice(2, 4)}.${Math.floor(+d.slice(5, 7) / 3) + 1}Q`, xfull: (d) => `${d.slice(0, 4)} ${Math.floor(+d.slice(5, 7) / 3) + 1}분기` } });
  const tcu = fs_('tcu'), ums = fs_('umcsent');
  G({ title: '설비가동률', src: 'FRED TCU · %', cls: 'c6', ranges: true, chartCfg: { freq: 'M', x: tcu.map((r) => r[0]), series: [{ label: '설비가동률', values: tcu.map((r) => r[1]), unit: '%', color: C.navy, width: 2 }], dec: 1, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  G({ title: '미시간대 소비자심리', src: 'FRED UMCSENT · 지수(1966=100)', cls: 'c6', ranges: true, chartCfg: { freq: 'M', x: ums.map((r) => r[0]), series: [{ label: '소비자심리', values: ums.map((r) => r[1]), unit: 'p', color: C.orange, width: 2 }], dec: 1, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  const hs = fs_('houst');
  G({ title: '주택착공', src: 'FRED HOUST · 천호, 연율', cls: 'c6', chartCfg: { x: hs.map((r) => r[0]), series: [{ type: 'bar', label: '주택착공', values: hs.map((r) => r[1]), unit: '천호', color: C.teal }], dec: 0, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  // 고용
  const pd = diffRows(fs_('payems')), p3 = avgRows(pd, 3); const PL = align(pd, p3);
  G({ title: '비농업 고용 — 월간 증감과 3개월 평균', src: 'FRED PAYEMS · 천명', cls: 'c6', chartCfg: { x: PL.x.slice(-42), series: [{ type: 'bar', label: '월간 증감', values: PL.cols[0].slice(-42), unit: '천명', color: C.navy, colorAt: (i, v) => v >= 0 ? C.navy : C.blue, signed: true }, { label: '3개월 평균', values: PL.cols[1].slice(-42), unit: '천명', color: C.red, width: 2.2, signed: true }], dec: 0, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  const unr = fs_('unrate'), prt = fs_('partic');
  G({ title: '실업률', src: 'FRED UNRATE · %', cls: 'c6', ranges: true, chartCfg: { freq: 'M', x: unr.map((r) => r[0]), series: [{ label: '실업률', values: unr.map((r) => r[1]), unit: '%', color: C.red, width: 2.2 }], dec: 1, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  G({ title: '경제활동참가율', src: 'FRED CIVPART · %', cls: 'c6', ranges: true, chartCfg: { freq: 'M', x: prt.map((r) => r[0]), series: [{ label: '경제활동참가율', values: prt.map((r) => r[1]), unit: '%', color: C.gray, width: 2 }], dec: 1, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  const cl = fs_('claims'), cl4 = avgRows(cl, 4), cc2 = fs_('cont_claims'); const CL = align(scaleRows(cl, 1e-3), scaleRows(cl4, 1e-3));
  G({ title: '신규 실업수당 청구 — 주간 · 4주 평균', src: 'FRED ICSA · 천건 · 주간, 가장 빠른 고용 지표', cls: 'c6', ranges: true, chartCfg: { freq: 'W', x: CL.x, series: [{ label: '신규 청구', values: CL.cols[0], unit: '천건', color: C.lred, width: 1.4 }, { label: '4주 평균', values: CL.cols[1], unit: '천건', color: C.red, width: 2.2 }], dec: 0, height: 240 } });
  G({ title: '계속 실업수당 청구', src: 'FRED CCSA · 천건 · 주간', cls: 'c6', ranges: true, chartCfg: { freq: 'W', x: cc2.map((r) => r[0]), series: [{ label: '계속 청구', values: cc2.map((r) => r[1] / 1e3), unit: '천건', color: C.blue, width: 2 }], dec: 0, height: 240 } });
  const ahy = yoyRows(fs_('ahe')), jol = fs_('jolts');
  G({ title: '시간당 평균임금 — 전년비', src: 'FRED CES0500000003 · %', cls: 'c6', ranges: true, chartCfg: { freq: 'M', x: ahy.map((r) => r[0]), series: [{ label: '시간당 임금 y/y', values: ahy.map((r) => r[1]), unit: '%', color: C.orange, width: 2 }], dec: 1, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  G({ title: 'JOLTS 구인건수', src: 'FRED JTSJOL · 백만건', cls: 'c6', ranges: true, chartCfg: { freq: 'M', x: jol.map((r) => r[0]), series: [{ label: 'JOLTS 구인', values: jol.map((r) => r[1] / 1e3), unit: '백만건', color: C.teal, width: 2 }], dec: 2, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  // 금리·스프레드
  const S1 = align(fs_('s10y2y'), fs_('s10y3m'));
  G({ title: '수익률 곡선 — 10년−2년 · 10년−3개월', src: 'FRED T10Y2Y·T10Y3M · %p · 역전 후 재정상화 구간이 과거 경기침체 직전', cls: 'c6', ranges: true, chartCfg: { x: S1.x, series: [{ label: '10년−2년', values: S1.cols[0], unit: '%p', color: C.navy, width: 2, signed: true }, { label: '10년−3개월', values: S1.cols[1], unit: '%p', color: C.gray, signed: true }], zero: true, dec: 2, height: 240 } });
  const S2 = align(fs_('hy_oas'), fs_('ig_oas'));
  G({ title: '크레딧 스프레드 — 하이일드 · 투자등급 OAS', src: 'FRED BAMLH0A0HYM2·BAMLC0A0CM · %p · 위험자산 온도계', cls: 'c6', ranges: true, chartCfg: { x: S2.x, series: [{ label: '하이일드 OAS', values: S2.cols[0], unit: '%p', color: C.red, width: 2 }, { label: '투자등급 OAS', values: S2.cols[1], unit: '%p', color: C.blue, width: 2 }], dec: 2, height: 240, zero: true } });
  // 유동성
  const fb = fs_('fed_bs'), tga = fs_('tga'), rrp = fs_('rrp');
  const NL = align(scaleRows(fb, 1e-6), scaleRows(tga, 1e-6)); const netLiq = NL.x.map((d, i) => { const a = NL.cols[0][i], b = NL.cols[1][i]; const rr = rrp.length ? (rrp.filter((r) => r[0] <= d).slice(-1)[0] || [null, null])[1] : null; return a != null && b != null ? a - b - (rr != null ? rr / 1e3 : 0) : null; });
  G({ title: '연준 총자산 · 순유동성', src: 'FRED WALCL·WTREGEN·RRPONTSYD · 조달러 · 주간 · 순유동성 = 총자산 − TGA − 역레포', cls: 'c6', ranges: true, chartCfg: { freq: 'W', x: NL.x, series: [{ label: '연준 총자산', values: NL.cols[0], unit: '조달러', color: C.navy, width: 2.2 }, { label: '순유동성', values: netLiq, unit: '조달러', color: C.red, width: 2 }], dec: 2, height: 240 } });
  const TR = align(scaleRows(tga, 1e-3), rrp);
  G({ title: '재무부 일반계정(TGA) · 역레포(RRP)', src: 'FRED WTREGEN(주간)·RRPONTSYD(일별) · 십억달러 · TGA 가 늘면 시중 유동성 흡수', cls: 'c6', ranges: true, chartCfg: { x: TR.x, series: [{ label: 'TGA', values: TR.cols[0], unit: '십억달러', color: C.orange, width: 2 }, { label: '역레포', values: TR.cols[1], unit: '십억달러', color: C.gray, width: 1.6 }], zero: true, dec: 0, height: 240 } });
  const m2y = yoyRows(fs_('m2')), nf = fs_('nfci');
  G({ title: 'M2 — 전년비', src: 'FRED M2SL · % · 2021년 27% 급증 뒤 정상화', cls: 'c6', ranges: true, chartCfg: { freq: 'M', x: m2y.map((r) => r[0]), series: [{ label: 'M2 y/y', values: m2y.map((r) => r[1]), unit: '%', color: C.navy, width: 2 }], zero: true, dec: 1, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  G({ title: '시카고 연은 금융여건지수 (NFCI)', src: 'FRED NFCI · 주간 · 0 이상이면 평균보다 긴축적, 음수면 완화적', cls: 'c6', ranges: true, chartCfg: { freq: 'W', x: nf.map((r) => r[0]), series: [{ label: 'NFCI', values: nf.map((r) => r[1]), unit: '', color: C.red, width: 2, signed: true }], zero: true, dec: 2, height: 240 } });
  // 미 → 국내 파급
  const kBase = B.baseRateSteps; const krMonthly = (() => { const out = []; const last = (ecosLast('base_rate') || { date: B.baseRateLast.date, v: B.baseRateLast.rate }); for (let y = 2019, m = 1; `${y}-${String(m).padStart(2, '0')}` <= last.date.slice(0, 7); m++) { if (m > 12) { m = 1; y++; } const key = `${y}-${String(m).padStart(2, '0')}`; if (key > last.date.slice(0, 7)) break; let r = null; for (const s of kBase) if (s.date <= key + '-31') r = s.rate; if (key === last.date.slice(0, 7)) r = last.v; out.push([key + '-01', r]); } return out; })();
  const ffM = (() => { const m = new Map(); for (const [d, v] of fs_('ffr_upper')) m.set(d.slice(0, 7) + '-01', v); return [...m.entries()]; })();
  const KU = align(krMonthly, ffM); const gap = KU.x.map((_, i) => KU.cols[0][i] != null && KU.cols[1][i] != null ? KU.cols[0][i] - KU.cols[1][i] : null);
  G({ title: '한미 정책금리 — 한국은행 기준금리 vs 연방기금 상단', src: '한국은행(보고서·ECOS) · FRED DFEDTARU · % · 월말 기준 · 역전폭이 클수록 원화 약세·외국인 채권자금 압력', cls: 'c6', chartCfg: { x: KU.x, step: true, series: [{ label: '한국 기준금리', values: KU.cols[0], unit: '%', color: C.red, width: 2.2 }, { label: '미국 연방기금 상단', values: KU.cols[1], unit: '%', color: C.navy, width: 2.2 }, { label: '한국−미국', values: gap, unit: '%p', color: C.gray, signed: true }], zero: true, dec: 2, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  const k10 = withEcos(B.ktb.dates, B.ktb.y10, 'ktb10'); const u10y = withY('ust10'); const KT = align(k10.x.map((d, i) => [d, k10.values[i]]), u10y.rows);
  G({ title: '국고채 10년 vs 미국채 10년', src: '한국은행·금융투자협회(ECOS 연장) · FRED DGS10 · %', cls: 'c6', ranges: true, chartCfg: { x: KT.x, series: [{ label: '국고채 10년', values: KT.cols[0], unit: '%', color: C.red, width: 2, extFrom: k10.extFrom != null ? KT.x.indexOf(k10.x[k10.extFrom]) : null }, { label: '미국채 10년', values: KT.cols[1], unit: '%', color: C.navy, width: 2, extFrom: u10y.extFrom != null ? KT.x.indexOf(u10y.rows[u10y.extFrom][0]) : null }], extLabel: '국고채는 ECOS, 미국채는 야후로 연장', dec: 2, height: 240 } });
  const fxE = withEcos(B.fx.dates, B.fx.usdkrw, 'usdkrw'); const DX = align(idxRows(fs_('dxy_broad'), '2025-01-01'), idxRows(fxE.x.map((d, i) => [d, fxE.values[i]]), '2025-01-01'));
  G({ title: '광의 달러지수 vs 원/달러 (2025-01 초=100)', src: 'FRED DTWEXBGS · 한국은행(ECOS) · 정규화 · 두 선이 벌어지면 원화 고유 요인', cls: 'c6', ranges: true, chartCfg: { x: DX.x, series: [{ label: '광의 달러지수', values: DX.cols[0], unit: '', color: C.navy, width: 2 }, { label: '원/달러', values: DX.cols[1], unit: '', color: C.red, width: 2 }], dec: 1, height: 240 } });
  const ksE = withEcos(B.kospi.dates, B.kospi.kospi, 'kospi'); const SK = align(idxRows(withY('sp500').rows, '2025-01-01'), idxRows(ksE.x.map((d, i) => [d, ksE.values[i]]), '2025-01-01'));
  G({ title: 'S&P 500 vs 코스피 (2025-01 초=100)', src: 'FRED SP500(야후 ^GSPC 연장) · 코스콤(ECOS 연장) · 정규화', cls: 'c6', ranges: true, chartCfg: { x: SK.x, series: [{ label: 'S&P 500', values: SK.cols[0], unit: '', color: C.navy, width: 2 }, { label: '코스피', values: SK.cols[1], unit: '', color: C.red, width: 2 }], dec: 1, height: 240 } });
  // 위험자산
  const vx = withY('vix');
  G({ title: 'VIX (야후로 당일까지 연장)', src: 'FRED VIXCLS + 야후 ^VIX(점선) · p', cls: 'c6', ranges: true, chartCfg: { x: vx.rows.map((r) => r[0]), series: [{ label: 'VIX', values: vx.rows.map((r) => r[1]), unit: 'p', color: C.purple, width: 2, extFrom: vx.extFrom }], refs: [{ y: 20, label: '20' }], dec: 1, height: 240, zero: true } });
  const gd = Y && Y.gold ? Y.gold.rows : [];
  if (gd.length) G({ title: '금 선물', src: '야후 GC=F (비공식) · 달러/온스 · FRED 에는 일별 금값이 없다', cls: 'c6', ranges: true, chartCfg: { x: gd.map((r) => r[0]), series: [{ label: '금 선물', values: gd.map((r) => r[1]), unit: '$/oz', color: C.gold, width: 2 }], dec: 0, height: 240 } });
  const yb = withY('brent'), yw = withY('wti'); const OD = align(yb.rows, yw.rows);
  const exI = (w) => w.extFrom != null ? OD.x.indexOf(w.rows[w.extFrom][0]) : null;
  G({ title: '유가 — 브렌트 · WTI (일별, 야후 선물로 당일까지 연장)', src: 'FRED DCOILBRENTEU·DCOILWTICO 현물 + 야후 BZ=F·CL=F 선물(점선, 비공식) · 달러/배럴 · 한국은행 8월 전제: 브렌트 2026 하반기 84달러(연평균 86), 2027년 74달러 · 비관 95, 낙관 76 (p.50)', cls: 'c6', ranges: true, chartCfg: { x: OD.x, series: [{ label: '브렌트', values: OD.cols[0], unit: '$/bbl', color: C.gold, width: 2, extFrom: exI(yb) }, { label: 'WTI', values: OD.cols[1], unit: '$/bbl', color: C.navy, width: 2, extFrom: exI(yw) }], refs: [{ y: 84, label: 'BOK 기본 84' }, { y: 95, label: '비관 95' }], dec: 1, height: 240 } });
  const OM = align(fs_('brent_m'), fs_('wti_m'), fs_('dubai_m'));
  G({ title: '유가 월평균 — 브렌트 · WTI · 두바이 (IMF)', src: 'FRED POILBREUSDM·POILWTIUSDM·POILDUBUSDM · 달러/배럴 · 두바이유는 IMF 월평균만 있어 일별은 싣지 않는다 · 국내 정유·물가는 두바이 기준', cls: 'c6', chartCfg: { x: OM.x.slice(-36), series: [{ label: '브렌트 월평균', values: OM.cols[0].slice(-36), unit: '$/bbl', color: C.gold, width: 2 }, { label: 'WTI 월평균', values: OM.cols[1].slice(-36), unit: '$/bbl', color: C.navy, width: 2 }, { label: '두바이 월평균', values: OM.cols[2].slice(-36), unit: '$/bbl', color: C.red, width: 2.2 }], dec: 1, height: 240, xfmt: (d) => xlab(d.slice(0, 7), true) } });
  const brSp = OD.x.map((_, i) => OD.cols[0][i] != null && OD.cols[1][i] != null ? OD.cols[0][i] - OD.cols[1][i] : null);
  G({ title: '브렌트 − WTI 스프레드', src: 'FRED · 달러/배럴 · 벌어지면 미국 밖(중동·해상) 공급 차질', cls: 'c6', ranges: true, chartCfg: { x: OD.x, series: [{ label: '브렌트−WTI', values: brSp, unit: '$', color: C.purple, width: 2, signed: true }], zero: true, dec: 1, height: 240 } });
  const yn = withY('natgas'); const gsl = fs_('gasoline');
  G({ title: '천연가스 (헨리허브, 야후 선물 연장)', src: 'FRED DHHNGSP 현물 + 야후 NG=F 선물(점선) · 달러/MMBtu', cls: 'c6', ranges: true, chartCfg: { x: yn.rows.map((r) => r[0]), series: [{ label: '천연가스', values: yn.rows.map((r) => r[1]), unit: '$/MMBtu', color: C.teal, width: 2, extFrom: yn.extFrom }], dec: 2, height: 240 } });
  G({ title: '미국 휘발유 소매가 (주간)', src: 'FRED GASREGW · 달러/갤런 · CPI 에너지·휘발유 항목의 선행', cls: 'c6', ranges: true, chartCfg: { freq: 'W', x: gsl.map((r) => r[0]), series: [{ label: '휘발유 소매가', values: gsl.map((r) => r[1]), unit: '$/gal', color: C.orange, width: 2 }], dec: 2, height: 240 } });
  // 계열 표
  const tc = document.createElement('div'); tc.className = 'card'; tc.dataset.region = 'global';
  tc.innerHTML = `<h3>FRED 계열 목록 (${Object.keys(F).length}개)${Y ? ` · 야후 연장 ${Object.keys(Y).length}개 (${esc(DATA.yahoo.fetchedAt)} 수집)` : ''}</h3><div class="src">수집 ${esc(DATA.fred.fetchedAt)} · 시작 ${esc(DATA.fred.start)} · 키 출처 ${esc(DATA.fred.keyFrom)} · 오류 ${DATA.fred.errors.length}건</div><div class="tbl" style="max-height:420px"><table><thead><tr><th class="tl">계열</th><th class="tl">FRED ID</th><th class="tl">구분</th><th class="tl">주기</th><th>건수</th><th class="tl">마지막</th><th>값</th></tr></thead><tbody>${Object.entries(F).map(([k, s]) => { const L = s.rows[s.rows.length - 1]; return `<tr><td class="tl">${esc(s.label)}</td><td class="tl">${esc(s.id)}</td><td class="tl">${esc(s.group)}</td><td class="tl">${esc(s.freq)}</td>${tdN(s.rows.length, 0)}<td class="tl">${esc(L[0])}</td>${tdN(L[1], L[1] > 1000 ? 0 : 2)}</tr>`; }).join('')}</tbody></table></div>`;
  g.appendChild(tc); makeSortable($('table', tc));
};
