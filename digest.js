/*
 * digest.js — 매크로 아침 브리핑 한 통(텔레그램 HTML). cache/*.json 만 읽고 새로 계산하지 않는다(차이·비율만).
 *
 *   node digest.js            → out/digest.html (봇 전송용) · out/digest.txt (태그 없음)
 *
 * 원칙 — 아침에 보는 숫자는 "간밤 미국장" 값이어야 한다(2026-09-15 사용자: "9/11 데이터는 의미가 없다").
 *   · 매일 움직이는 값은 당일치가 나오는 출처만: 재무부 수익률 곡선(cache/rates.json) · 야후(cache/yahoo.json) · 뉴욕 연은 SOFR/EFFR
 *   · FRED 는 월간·주간 지표(물가·고용·활동·연준 자산)에만. 일별 FRED(OAS 등)는 당일치 대체가 없을 때만, 날짜를 붙여서.
 *   · 세션일(S) = 재무부·S&P 중 가장 늦은 날짜. 그보다 오래된 값에는 반드시 (m/d) 를 붙인다.
 *   · 없는 값은 줄에서 빼고, 0 으로 채우지 않는다. 수출 (E)월은 싣지 않는다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'cache', f), 'utf8')); } catch { return null; } };
const FRED = rd('fred.json'), ECOS = rd('ecos.json'), Y = rd('yahoo.json'), CONS = rd('consensus.json'), R = rd('rates.json');
const LINK = 'https://rsm0kk.github.io/bok-monitor/';

const isNum = (v) => typeof v === 'number' && isFinite(v);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const b = (s) => `<b>${s}</b>`;
const fmt = (v, d = 2) => (isNum(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−') : null);
const sgn = (v, d = 2, unit = '') => (!isNum(v) ? null : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}${unit}`);
const md = (iso) => (iso ? `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}` : '');
const ym = (iso) => (iso ? `${+iso.slice(5, 7)}월` : '');
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const join = (parts) => parts.filter(Boolean).join(' · ');

const rows = (src, k) => (src && src.series && src.series[k] && src.series[k].rows) || [];
const last = (src, k, n = 0) => { const r = rows(src, k); return r.length > n ? r[r.length - 1 - n] : null; };
function lv(src, k, d = 2, unit = '') {
  const a = last(src, k), p = last(src, k, 1);
  return a ? { d: a[0], v: a[1], txt: fmt(a[1], d) + unit, diff: p ? a[1] - p[1] : null, chg: p ? sgn(a[1] - p[1], d) : null } : null;
}
function yoy(src, k, lag = 12) {
  const r = rows(src, k);
  if (r.length <= lag + 1) return null;
  const f = (i) => (r[i - lag][1] ? (r[i][1] / r[i - lag][1] - 1) * 100 : null);
  return { d: r[r.length - 1][0], v: f(r.length - 1), p: f(r.length - 2) };
}
function mom(src, k) {
  const r = rows(src, k);
  if (r.length < 3) return null;
  const f = (i) => (r[i - 1][1] ? (r[i][1] / r[i - 1][1] - 1) * 100 : null);
  return { d: r[r.length - 1][0], v: f(r.length - 1), p: f(r.length - 2) };
}
/** 야후 계열: 최신값 · 전일 대비 % · 전일 대비 차이 */
function yq(k) {
  const r = rows(Y, k);
  if (r.length < 2) return null;
  const a = r[r.length - 1], p = r[r.length - 2];
  return { d: a[0], v: a[1], pct: p[1] ? (a[1] / p[1] - 1) * 100 : null, diff: a[1] - p[1] };
}
/** rates.json 의 [date, {…}] 계열 */
const rr = (k) => (R && Array.isArray(R[k]) ? R[k] : []);
const bp = (a, p) => {
  if (!isNum(a) || !isNum(p)) return null;
  const n = Math.round((a - p) * 100);   // 반올림 뒤 부호를 정한다 — 0.4bp 가 "−0bp" 로 찍히지 않게
  return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}bp`;
};

/* 미국 동부시간 → KST (EDT +13h / EST +14h) */
function etToKst(et) {
  const [d, t] = et.split('T');
  const [Yr, M, D] = d.split('-').map(Number);
  const nthSun = (y, m, n) => { const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + (n - 1) * 7; };
  const dst = (M > 3 && M < 11) || (M === 3 && D >= nthSun(Yr, 3, 2)) || (M === 11 && D < nthSun(Yr, 11, 1));
  const [h, mi] = (t || '00:00').split(':').map(Number);
  const k = new Date(Date.UTC(Yr, M - 1, D, h + (dst ? 13 : 14), mi));
  return { date: k.toISOString().slice(0, 10), hm: `${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`, wd: WD[k.getUTCDay()] };
}

function build() {
  const kstNow = new Date(Date.now() + 9 * 3600000);
  const today = kstNow.toISOString().slice(0, 10);
  const L = [];

  // 세션일 — 재무부 곡선과 S&P 중 늦은 날
  const nom = rr('nominal'), real = rr('real');
  const S = [nom.length ? nom[nom.length - 1][0] : null, last(Y, 'sp500') ? last(Y, 'sp500')[0] : null].filter(Boolean).sort().pop() || null;
  const tag = (d) => (d && S && d < S ? ` (${md(d)})` : '');
  const stale = [];   // 세션일보다 늦은 값 목록 — 꼬리에 한 줄로 밝힌다

  L.push(b('🌏 매크로 아침 브리핑') + ` · ${md(today)}(${WD[kstNow.getUTCDay()]}) ${String(kstNow.getUTCHours()).padStart(2, '0')}:${String(kstNow.getUTCMinutes()).padStart(2, '0')} KST`);
  L.push('━━━━━━━━━━━━━━━');

  // ── 간밤 미국장 ──
  if (S) {
    const sw = WD[new Date(`${S}T00:00:00Z`).getUTCDay()];
    L.push('');
    L.push(b(`🇺🇸 간밤 미국장 · ${md(S)}(${sw}) 마감`));
    const ix = (k, nm, d = 0) => { const q = yq(k); if (!q) return null; if (q.d < S) stale.push(nm); return `${nm} ${fmt(q.v, d)} ${b(sgn(q.pct, 1, '%'))}${tag(q.d)}`; };
    L.push(join([ix('sp500', 'S&P'), ix('nasdaq', '나스닥'), ix('sox', 'SOX')]));
    const vix = yq('vix'), move = yq('move');
    L.push(join([vix && `VIX ${b(fmt(vix.v, 1))} (${sgn(vix.diff, 1)})${tag(vix.d)}`, move && `MOVE ${fmt(move.v, 1)} (${sgn(move.diff, 1)})${tag(move.d)}`,
      yq('hyg') && `HYG ${sgn(yq('hyg').pct, 2, '%')}${tag(yq('hyg').d)}`, yq('lqd') && `LQD ${sgn(yq('lqd').pct, 2, '%')}${tag(yq('lqd').d)}`]));

    // 금리 — 재무부
    if (nom.length >= 2) {
      const [nd, n] = nom[nom.length - 1], p = nom[nom.length - 2][1];
      if (nd < S) stale.push('국채');
      L.push('');
      L.push(b('📈 미국채 금리') + ` (재무부 ${md(nd)} · 전일비)`);
      const t = (k, nm) => (isNum(n[k]) ? `${nm} ${b(fmt(n[k], 2))} (${bp(n[k], p[k])})` : null);
      L.push(join([t('m3', '3m'), t('y2', '2y'), t('y10', '10y'), t('y30', '30y')]));
      const s102 = isNum(n.y10) && isNum(n.y2) ? n.y10 - n.y2 : null, s102p = isNum(p.y10) && isNum(p.y2) ? p.y10 - p.y2 : null;
      const s103 = isNum(n.y10) && isNum(n.m3) ? n.y10 - n.m3 : null;
      const rl = real.length ? real[real.length - 1] : null, rp = real.length > 1 ? real[real.length - 2] : null;
      const r10 = rl && isNum(rl[1].y10) ? rl[1].y10 : null;
      L.push(join([
        isNum(s102) && `10−2y ${b(sgn(Math.round(s102 * 100), 0, 'bp'))}${isNum(s102p) ? ` (${bp(s102, s102p)})` : ''}`,
        isNum(s103) && `10y−3m ${sgn(Math.round(s103 * 100), 0, 'bp')}`,
        isNum(r10) && `실질 10y ${b(fmt(r10, 2))}${rp && isNum(rp[1].y10) ? ` (${bp(r10, rp[1].y10)})` : ''}${rl[0] !== nd ? ` (${md(rl[0])})` : ''}`,
        isNum(r10) && isNum(n.y10) && rl[0] === nd && `BEI ${fmt(n.y10 - r10, 2)}`,
      ]));
      const sofr = rr('sofr'), effr = rr('effr'), ff = lv(FRED, 'ffr_upper');
      const sl = sofr.length ? sofr[sofr.length - 1] : null, el = effr.length ? effr[effr.length - 1] : null;
      const hy = lv(FRED, 'hy_oas'), ig = lv(FRED, 'ig_oas');
      L.push(join([ff && `연방기금 상단 ${ff.txt}%`, el && `EFFR ${fmt(el[1], 2)}${tag(el[0])}`, sl && `SOFR ${fmt(sl[1], 2)}${tag(sl[0])}`,
        hy && `HY OAS ${hy.txt}%p${tag(hy.d)}`, ig && `IG ${ig.txt}%p${tag(ig.d)}`]));
    }

    // 달러·원자재 — 야후
    L.push('');
    L.push(b('💱 달러·원자재') + ' (전일비)');
    const cm = (k, nm, d, pre = '') => { const q = yq(k); if (!q) return null; if (q.d < S) stale.push(nm); return `${nm} ${pre}${b(fmt(q.v, d))} (${sgn(q.pct, 1, '%')})${tag(q.d)}`; };
    L.push(join([cm('dxy', 'DXY', 2), cm('krw', '원/달러', 1), cm('gold', '금', 0, '$')]));
    L.push(join([cm('brent', '브렌트', 2, '$'), cm('wti', 'WTI', 2, '$'), cm('natgas', '천연가스', 2, '$')]));
  }

  // ── 물가·고용·활동 (월간 — FRED) ──
  if (FRED) {
    const cpi = yoy(FRED, 'cpi'), cc = yoy(FRED, 'core_cpi'), pce = yoy(FRED, 'pce'), cp = yoy(FRED, 'core_pce'), ppi = yoy(FRED, 'ppi');
    const cpim = mom(FRED, 'cpi'), ccm = mom(FRED, 'core_cpi');
    L.push('');
    L.push(b('🇺🇸 물가·고용·활동') + ' (발표된 최신월 · 전년비, 괄호 직전월)');
    const yl = (o, nm) => (o && isNum(o.v) ? `${nm} ${ym(o.d)} ${b(sgn(o.v, 1, '%'))}${isNum(o.p) ? ` (${sgn(o.p, 1)})` : ''}` : null);
    L.push(join([yl(cpi, 'CPI'), yl(cc, '근원'), cpim && isNum(cpim.v) ? `m/m ${sgn(cpim.v, 1)}/${ccm && isNum(ccm.v) ? sgn(ccm.v, 1) : '—'}` : null]));
    L.push(join([yl(pce, 'PCE'), yl(cp, '근원 PCE'), yl(ppi, 'PPI')]));
    const pe = rows(FRED, 'payems'), un = lv(FRED, 'unrate', 1), cl = lv(FRED, 'claims', 0), ahe = yoy(FRED, 'ahe');
    const pay = pe.length > 2 ? { d: pe[pe.length - 1][0], v: pe[pe.length - 1][1] - pe[pe.length - 2][1], p: pe[pe.length - 2][1] - pe[pe.length - 3][1] } : null;
    L.push(join([pay && `고용 ${ym(pay.d)} ${b(sgn(pay.v, 0, 'k'))} (${sgn(pay.p, 0, 'k')})`, un && `실업률 ${b(un.txt)}%`, ahe && isNum(ahe.v) && `임금 y/y ${sgn(ahe.v, 1, '%')}`, cl && `신규청구 ${b(fmt(cl.v / 1000, 0))}k (${md(cl.d)}주)`]));
    const rt = mom(FRED, 'retail'), ip = mom(FRED, 'indpro'), gdp = rows(FRED, 'gdp');
    const g = gdp.length > 2 ? { d: gdp[gdp.length - 1][0], v: (Math.pow(gdp[gdp.length - 1][1] / gdp[gdp.length - 2][1], 4) - 1) * 100 } : null;
    const um = lv(FRED, 'umcsent', 1);
    L.push(join([rt && isNum(rt.v) && `소매판매 ${ym(rt.d)} m/m ${b(sgn(rt.v, 1, '%'))}`, ip && isNum(ip.v) && `산업생산 ${sgn(ip.v, 1, '%')}`, g && `GDP ${Math.ceil(+g.d.slice(5, 7) / 3)}Q 연율 ${b(sgn(g.v, 1, '%'))}`, um && `미시간 심리 ${um.txt}`]));

    // 유동성 (주간 — H.4.1 은 목요일 공개)
    const bs = lv(FRED, 'fed_bs', 0), tga = lv(FRED, 'tga', 0), rrp = lv(FRED, 'rrp', 1), m2 = yoy(FRED, 'm2');
    L.push(join([bs && `💧 연준자산 ${b('$' + fmt(bs.v / 1e6, 2) + 'T')} (주 ${sgn(bs.diff / 1e3, 1, 'B')}, ${md(bs.d)})`, tga && `TGA $${fmt(tga.v / 1e3, 0)}B`, rrp && `RRP $${fmt(rrp.v, 0)}B`, m2 && isNum(m2.v) && `M2 y/y ${sgn(m2.v, 1, '%')}`]));
  }

  // ── 한국 ──
  if (ECOS) {
    const br = lv(ECOS, 'base_rate', 2), k3 = lv(ECOS, 'ktb3', 3), k10 = lv(ECOS, 'ktb10', 3), aa = lv(ECOS, 'corp_aa', 3), fx = lv(ECOS, 'usdkrw', 1), ks = lv(ECOS, 'kospi', 2);
    const fn = rows(ECOS, 'foreign_net'), kc = yoy(ECOS, 'cpi');
    const f5 = fn.slice(-5).reduce((a, r) => a + r[1], 0);
    const ksp = ks && isNum(ks.diff) ? (ks.diff / (ks.v - ks.diff)) * 100 : null;
    L.push('');
    L.push(b('🇰🇷 한국') + (k3 ? ` (ECOS ${md(k3.d)})` : ''));
    L.push(join([br && `기준금리 ${b(br.txt)}%`, k3 && `국고3y ${b(k3.txt)}% (${bp(k3.v, k3.v - k3.diff)})`, k10 && `10y ${k10.txt}% (${bp(k10.v, k10.v - k10.diff)})`, aa && k3 && `AA− 스프레드 ${sgn(Math.round((aa.v - k3.v) * 1000) / 10, 1, 'bp')}`]));
    L.push(join([fx && `원/달러 ${b(fmt(fx.v, 1))} (${fx.chg})`, ks && `KOSPI ${fmt(ks.v, 0)} ${b(sgn(ksp, 2, '%'))}`,
      fn.length && `외국인 ${b(sgn(fn[fn.length - 1][1] / 1e4, 2, '조'))} (5일 ${sgn(f5 / 1e4, 2, '조')})`, kc && isNum(kc.v) && `CPI ${ym(kc.d)} y/y ${sgn(kc.v, 1, '%')}`]));
  }

  // ── 발표 결과·일정 ──
  if (CONS && CONS.events) {
    const evs = Object.values(CONS.events).map((e) => ({ ...e, k: etToKst(e.date) }));
    const from = new Date(kstNow.getTime() - 24 * 3600000).toISOString().slice(0, 10);
    const to = new Date(kstNow.getTime() + 7 * 24 * 3600000).toISOString().slice(0, 10);
    const done = evs.filter((e) => e.actual != null && e.k.date >= from && e.k.date <= today).sort((a, c) => a.date.localeCompare(c.date));
    const up = evs.filter((e) => e.actual == null && e.k.date >= today && e.k.date <= to && e.impact !== 'Low').sort((a, c) => a.date.localeCompare(c.date));
    if (done.length) {
      L.push('');
      L.push(b('✅ 발표 결과') + ' (실제 / 예상 → 판정)');
      for (const e of done) L.push(`${md(e.k.date)} ${esc(e.title)} ${b(esc(String(e.actual) + (e.unit || '')))} / ${esc(e.forecast || '—')} → ${b(esc(e.verdict || '—'))}`);
    }
    if (up.length) {
      L.push('');
      L.push(b('📅 이번 주 발표') + ' (KST · 예상 / 이전)');
      let curD = '';
      for (const e of up.slice(0, 14)) {
        const dl = `${md(e.k.date)}(${e.k.wd})`;
        const lead = dl === curD ? '　' : dl; curD = dl;
        L.push(`${lead} ${e.k.hm} ${e.impact === 'High' ? b(esc(e.title)) : esc(e.title)} ${esc(e.forecast || '—')} / ${esc(e.previous || '—')}`);
      }
    }
  }

  L.push('━━━━━━━━━━━━━━━');
  if (stale.length) L.push(`⚠️ 간밤 값이 아직 없는 항목: ${esc([...new Set(stale)].join(', '))} — 괄호 날짜 기준`);
  L.push(`시장 재무부·야후·뉴욕연은(SOFR·EFFR 은 하루 뒤 공개) · 지표 FRED·ECOS · 일정 ForexFactory · <a href="${LINK}">대시보드</a>`);
  return L.join('\n');
}

const html = build();
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'out', 'digest.html'), html, 'utf8');
fs.writeFileSync(path.join(ROOT, 'out', 'digest.txt'), html.replace(/<a href="([^"]+)">([^<]*)<\/a>/g, '$2 $1').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), 'utf8');
console.log(`→ out/digest.html (${html.replace(/<[^>]+>/g, '').length}자)`);
