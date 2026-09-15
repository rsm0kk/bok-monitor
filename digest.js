/*
 * digest.js — 매크로 아침 브리핑 한 통(텔레그램 HTML). cache/*.json 만 읽고 새로 계산하지 않는다.
 *
 *   node digest.js            → out/digest.html (봇 전송용) · out/digest.txt (태그 없음)
 *
 * 구성: 미국 금리·크레딧 / 물가·고용·활동 / 유동성 / 달러·위험·원자재 / 한국(ECOS) / 이번 주 발표(컨센서스·판정)
 * 값의 기준일을 항상 붙인다 — FRED 는 3~5일 늦고 야후 당일치는 점선(참고)이다. 없는 값은 빼고, 0 으로 채우지 않는다.
 * 수출 (E)월은 싣지 않는다(1~10일 환산치라 증감률 금지).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'cache', f), 'utf8')); } catch { return null; } };
const FRED = rd('fred.json'), ECOS = rd('ecos.json'), Y = rd('yahoo.json'), CONS = rd('consensus.json');
const LINK = 'https://rsm0kk.github.io/bok-monitor/';

const isNum = (v) => typeof v === 'number' && isFinite(v);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const b = (s) => `<b>${s}</b>`;
const fmt = (v, d = 2) => (isNum(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−') : null);
const sgn = (v, d = 2, unit = '') => (!isNum(v) ? null : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}${unit}`);
const md = (iso) => (iso ? `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}` : '');
const ym = (iso) => (iso ? `${+iso.slice(5, 7)}월` : '');
const WD = ['일', '월', '화', '수', '목', '금', '토'];

const rows = (src, k) => (src && src.series && src.series[k] && src.series[k].rows) || [];
const last = (src, k, n = 0) => { const r = rows(src, k); return r.length > n ? r[r.length - 1 - n] : null; };
/** 최신값 + 직전 관측 대비 변화 */
function lv(src, k, d = 2, unit = '') {
  const a = last(src, k), p = last(src, k, 1);
  return a ? { d: a[0], v: a[1], txt: fmt(a[1], d) + unit, chg: p ? sgn(a[1] - p[1], d) : null } : null;
}
/** 전년비 최신·직전 */
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
/** 야후 당일치가 FRED 보다 새로우면 "(야후 m/d 값)" 을 덧붙인다 */
function withY(k, d = 2) {
  const f = last(FRED, k), y = last(Y, k);
  if (!f) return y ? `${fmt(y[1], d)} (야후 ${md(y[0])})` : null;
  let s = `${fmt(f[1], d)}`;
  if (y && y[0] > f[0]) s += ` → ${fmt(y[1], d)} (야후 ${md(y[0])})`;
  return s;
}

/* 미국 동부시간 → KST. 3월 둘째 일요일 ~ 11월 첫째 일요일은 EDT(+13h), 그 외 EST(+14h). */
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
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600000);
  const today = kstNow.toISOString().slice(0, 10);
  const L = [];
  const join = (parts) => parts.filter(Boolean).join(' · ');

  L.push(b('🌏 매크로 아침 브리핑') + ` · ${md(today)}(${WD[kstNow.getUTCDay()]}) ${String(kstNow.getUTCHours()).padStart(2, '0')}:${String(kstNow.getUTCMinutes()).padStart(2, '0')} KST`);
  L.push('━━━━━━━━━━━━━━━');

  // ── 미국 금리·크레딧 ──
  if (FRED) {
    const u2 = lv(FRED, 'ust2'), u30 = lv(FRED, 'ust30'), s102 = lv(FRED, 's10y2y'), s103 = lv(FRED, 's10y3m');
    const r10 = lv(FRED, 'real10'), be = lv(FRED, 'be10'), hy = lv(FRED, 'hy_oas'), ig = lv(FRED, 'ig_oas'), ff = lv(FRED, 'ffr_upper'), so = lv(FRED, 'sofr');
    L.push('');
    L.push(b('🇺🇸 미국 금리·크레딧') + (u2 ? ` (FRED ${md(u2.d)})` : ''));
    L.push(join([u2 && `2y ${b(u2.txt)}`, withY('ust10') && `10y ${b(withY('ust10'))}`, u30 && `30y ${b(u30.txt)}`]) + '%');
    L.push(join([s102 && `10−2y ${b(sgn(s102.v, 2, '%p'))}`, s103 && `10y−3m ${sgn(s103.v, 2, '%p')}`, r10 && `실질 10y ${b(r10.txt)}%`, be && `BEI ${be.txt}%`]));
    L.push(join([hy && `HY OAS ${b(hy.txt)}%p${hy.chg ? ` (${hy.chg})` : ''}`, ig && `IG ${ig.txt}%p`, ff && `연방기금 상단 ${ff.txt}%`, so && `SOFR ${so.txt}%`]));

    // ── 물가·고용·활동 ──
    const cpi = yoy(FRED, 'cpi'), cc = yoy(FRED, 'core_cpi'), pce = yoy(FRED, 'pce'), cp = yoy(FRED, 'core_pce'), ppi = yoy(FRED, 'ppi');
    const cpim = mom(FRED, 'cpi'), ccm = mom(FRED, 'core_cpi');
    L.push('');
    L.push(b('🇺🇸 물가·고용·활동') + ' (전년비 · 괄호 직전월)');
    const yl = (o, nm) => o && isNum(o.v) ? `${nm} ${ym(o.d)} ${b(sgn(o.v, 1, '%'))}${isNum(o.p) ? ` (${sgn(o.p, 1)})` : ''}` : null;
    L.push(join([yl(cpi, 'CPI'), yl(cc, '근원'), cpim && isNum(cpim.v) ? `m/m ${sgn(cpim.v, 1)}/${ccm && isNum(ccm.v) ? sgn(ccm.v, 1) : '—'}` : null]));
    L.push(join([yl(pce, 'PCE'), yl(cp, '근원 PCE'), yl(ppi, 'PPI')]));
    const pe = rows(FRED, 'payems'), un = lv(FRED, 'unrate', 1), cl = lv(FRED, 'claims', 0), ahe = yoy(FRED, 'ahe');
    const pay = pe.length > 2 ? { d: pe[pe.length - 1][0], v: pe[pe.length - 1][1] - pe[pe.length - 2][1], p: pe[pe.length - 2][1] - pe[pe.length - 3][1] } : null;
    L.push(join([pay && `고용 ${ym(pay.d)} ${b(sgn(pay.v, 0, 'k'))} (${sgn(pay.p, 0, 'k')})`, un && `실업률 ${b(un.txt)}%`, ahe && isNum(ahe.v) && `임금 y/y ${sgn(ahe.v, 1, '%')}`, cl && `신규청구 ${b(fmt(cl.v / 1000, 0))}k (${md(cl.d)})`]));
    const rt = mom(FRED, 'retail'), ip = mom(FRED, 'indpro'), gdp = rows(FRED, 'gdp');
    const g = gdp.length > 2 ? { d: gdp[gdp.length - 1][0], v: (Math.pow(gdp[gdp.length - 1][1] / gdp[gdp.length - 2][1], 4) - 1) * 100 } : null;
    const um = lv(FRED, 'umcsent', 1);
    L.push(join([rt && isNum(rt.v) && `소매판매 ${ym(rt.d)} m/m ${b(sgn(rt.v, 1, '%'))}`, ip && isNum(ip.v) && `산업생산 ${sgn(ip.v, 1, '%')}`, g && `GDP ${Math.ceil(+g.d.slice(5, 7) / 3)}Q 연율 ${b(sgn(g.v, 1, '%'))}`, um && `미시간 심리 ${um.txt}`]));

    // ── 유동성 ──
    const bs = lv(FRED, 'fed_bs', 0), tga = lv(FRED, 'tga', 0), rrp = lv(FRED, 'rrp', 1), nf = lv(FRED, 'nfci', 2), m2 = yoy(FRED, 'm2');
    L.push('');
    L.push(b('💧 유동성'));
    // fed_bs 단위는 백만달러 — 주간 증감은 십억달러(B)로
    L.push(join([bs && `연준자산 ${b('$' + fmt(bs.v / 1e6, 2) + 'T')}${bs.chg ? ` (주 ${sgn((bs.v - last(FRED, 'fed_bs', 1)[1]) / 1e3, 1, 'B')})` : ''}`,
      tga && `TGA $${fmt(tga.v / 1e3, 0)}B`, rrp && `RRP $${fmt(rrp.v, 0)}B`, nf && `NFCI ${nf.txt}`, m2 && isNum(m2.v) && `M2 y/y ${sgn(m2.v, 1, '%')}`]));

    // ── 달러·위험·원자재 ──
    const dxy = lv(FRED, 'dxy_broad', 1), sp = lv(FRED, 'sp500', 0), ng = lv(FRED, 'natgas', 2), gas = lv(FRED, 'gasoline', 2);
    L.push('');
    L.push(b('💱 달러·위험·원자재'));
    L.push(join([dxy && `광의달러 ${dxy.txt} (${md(dxy.d)})`, withY('vix', 1) && `VIX ${b(withY('vix', 1))}`, sp && `S&P ${fmt(sp.v, 0)} (${md(sp.d)})`]));
    L.push(join([withY('brent', 1) && `브렌트 $${b(withY('brent', 1))}`, withY('wti', 1) && `WTI $${withY('wti', 1)}`, ng && `천연가스 $${ng.txt}`, gas && `휘발유 $${gas.txt}/gal`]));
  }

  // ── 한국 ──
  if (ECOS) {
    const br = lv(ECOS, 'base_rate', 2), k3 = lv(ECOS, 'ktb3', 3), k10 = lv(ECOS, 'ktb10', 3), aa = lv(ECOS, 'corp_aa', 3), fx = lv(ECOS, 'usdkrw', 1), ks = lv(ECOS, 'kospi', 2);
    const fn = rows(ECOS, 'foreign_net'), kc = yoy(ECOS, 'cpi');
    const f5 = fn.slice(-5).reduce((a, r) => a + r[1], 0);
    L.push('');
    L.push(b('🇰🇷 한국') + (k3 ? ` (ECOS ${md(k3.d)})` : ''));
    L.push(join([br && `기준금리 ${b(br.txt)}%`, k3 && `국고3y ${b(k3.txt)}%${k3.chg ? ` (${k3.chg})` : ''}`, k10 && `10y ${k10.txt}%`, aa && k3 && `AA− 스프레드 ${sgn(aa.v - k3.v, 3, '%p')}`]));
    L.push(join([fx && `원/달러 ${b(fmt(fx.v, 1))}${fx.chg ? ` (${fx.chg})` : ''}`, ks && `KOSPI ${fmt(ks.v, 0)}`,
      fn.length && `외국인 ${b(sgn(fn[fn.length - 1][1] / 1e4, 2, '조'))} (5일 ${sgn(f5 / 1e4, 2, '조')})`, kc && isNum(kc.v) && `CPI ${ym(kc.d)} y/y ${sgn(kc.v, 1, '%')}`]));
  }

  // ── 이번 주 발표 ──
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
  L.push(`FRED·ECOS 는 기준일 표기 · 야후 당일치는 참고 · 컨센서스 ForexFactory · <a href="${LINK}">대시보드</a>`);
  return L.join('\n');
}

const html = build();
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'out', 'digest.html'), html, 'utf8');
fs.writeFileSync(path.join(ROOT, 'out', 'digest.txt'), html.replace(/<a href="([^"]+)">([^<]*)<\/a>/g, '$2 $1').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), 'utf8');
console.log(`→ out/digest.html (${html.replace(/<[^>]+>/g, '').length}자)`);
