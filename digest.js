/*
 * digest.js — 매크로 아침 브리핑 한 통(텔레그램 HTML). cache/*.json 만 읽고 새로 계산하지 않는다(차이·비율만).
 *
 *   node digest.js            → out/digest.html (봇 전송용) · out/digest.txt (태그 없음)
 *
 * 원칙 — 전일·금일 데이터만 싣는다(2026-09-15 사용자: "9/11 데이터는 의미가 없다" → "전일, 금일 데이터 아닌 거면 안 보내도 된다").
 *   · 미국 = 세션일(S, 재무부 곡선·S&P 중 늦은 날)과 같은 날짜의 값만. S 자체가 직전 평일보다 오래되면 미국 섹션을 통째로 뺀다.
 *   · 한국 = 직전 평일(KST) 이후 값만.
 *   · 정책금리(연준 상단·한은 기준금리)는 지금 적용 중인 값이라 날짜와 무관하게 남긴다.
 *   · 월간·주간 지표(물가·고용·활동·연준 자산)는 싣지 않는다 — 발표된 날에만 '발표 결과'(컨센서스 판정)로 나온다.
 *   · 일정(이번 주 발표)은 데이터가 아니라 남긴다. 새 데이터 줄이 하나도 없으면 빈 파일을 써서 보내지 않는다.
 *   · 출처: 국채 = 재무부 CSV(rates.json) · 지수·변동성·달러·원자재 = 야후(yahoo.json) · SOFR·EFFR = 뉴욕 연은 · 한국 = ECOS.
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
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const join = (parts) => parts.filter(Boolean).join(' · ');

const rows = (src, k) => (src && src.series && src.series[k] && src.series[k].rows) || [];
const last = (src, k, n = 0) => { const r = rows(src, k); return r.length > n ? r[r.length - 1 - n] : null; };
function lv(src, k, d = 2, unit = '') {
  const a = last(src, k), p = last(src, k, 1);
  return a ? { d: a[0], v: a[1], txt: fmt(a[1], d) + unit, diff: p ? a[1] - p[1] : null, chg: p ? sgn(a[1] - p[1], d) : null } : null;
}
/** 야후 계열: 최신값 · 전일 대비 % · 차이 */
function yq(k) {
  const r = rows(Y, k);
  if (r.length < 2) return null;
  const a = r[r.length - 1], p = r[r.length - 2];
  return { d: a[0], v: a[1], pct: p[1] ? (a[1] / p[1] - 1) * 100 : null, diff: a[1] - p[1] };
}
const rr = (k) => (R && Array.isArray(R[k]) ? R[k] : []);
const bp = (a, p) => {
  if (!isNum(a) || !isNum(p)) return null;
  const n = Math.round((a - p) * 100);   // 반올림 뒤 부호 — 0.4bp 가 "−0bp" 로 찍히지 않게
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
  // 직전 평일 — 월요일이면 금요일. 미국 세션일·한국 데이터 모두 이날 이후여야 '전일·금일'.
  const prevWk = (() => { const d = new Date(`${today}T00:00:00Z`); do { d.setUTCDate(d.getUTCDate() - 1); } while ([0, 6].includes(d.getUTCDay())); return d.toISOString().slice(0, 10); })();

  const nom = rr('nominal'), real = rr('real');
  const S = [nom.length ? nom[nom.length - 1][0] : null, last(Y, 'sp500') ? last(Y, 'sp500')[0] : null].filter(Boolean).sort().pop() || null;
  const usOK = !!(S && S >= prevWk);
  const usFresh = (d) => !!(usOK && d && d >= S);
  const krFresh = (d) => !!(d && d >= prevWk);

  const L = [];
  let body = 0;   // 실제로 실은 데이터 줄 수 — 0 이면 보내지 않는다
  const push = (line) => { if (line) { L.push(line); body += 1; } };

  L.push(b('🌏 매크로 아침 브리핑') + ` · ${md(today)}(${WD[kstNow.getUTCDay()]}) ${String(kstNow.getUTCHours()).padStart(2, '0')}:${String(kstNow.getUTCMinutes()).padStart(2, '0')} KST`);
  L.push('━━━━━━━━━━━━━━━');

  // ── 간밤 미국장 ──
  if (usOK) {
    const fy = (k) => { const q = yq(k); return q && usFresh(q.d) ? q : null; };
    const sw = WD[new Date(`${S}T00:00:00Z`).getUTCDay()];
    L.push('');
    L.push(b(`🇺🇸 간밤 미국장 · ${md(S)}(${sw}) 마감`));
    const ix = (k, nm, d = 0) => { const q = fy(k); return q ? `${nm} ${fmt(q.v, d)} ${b(sgn(q.pct, 1, '%'))}` : null; };
    push(join([ix('sp500', 'S&P'), ix('nasdaq', '나스닥'), ix('sox', 'SOX')]));
    const vix = fy('vix'), move = fy('move'), hyg = fy('hyg'), lqd = fy('lqd');
    push(join([vix && `VIX ${b(fmt(vix.v, 1))} (${sgn(vix.diff, 1)})`, move && `MOVE ${fmt(move.v, 1)} (${sgn(move.diff, 1)})`,
      hyg && `HYG ${sgn(hyg.pct, 2, '%')}`, lqd && `LQD ${sgn(lqd.pct, 2, '%')}`]));

    // 국채 — 재무부. 세션일 값이 아니면 섹션을 뺀다.
    const ff = lv(FRED, 'ffr_upper');
    if (nom.length >= 2 && usFresh(nom[nom.length - 1][0])) {
      const [nd, n] = nom[nom.length - 1], p = nom[nom.length - 2][1];
      L.push('');
      L.push(b('📈 미국채 금리') + ` (재무부 ${md(nd)} · 전일비)`);
      const t = (k, nm) => (isNum(n[k]) ? `${nm} ${b(fmt(n[k], 2))} (${bp(n[k], p[k])})` : null);
      push(join([t('m3', '3m'), t('y2', '2y'), t('y10', '10y'), t('y30', '30y')]));
      const s102 = isNum(n.y10) && isNum(n.y2) ? n.y10 - n.y2 : null, s102p = isNum(p.y10) && isNum(p.y2) ? p.y10 - p.y2 : null;
      const s103 = isNum(n.y10) && isNum(n.m3) ? n.y10 - n.m3 : null;
      const rl = real.length ? real[real.length - 1] : null, rp = real.length > 1 ? real[real.length - 2] : null;
      const r10 = rl && rl[0] === nd && isNum(rl[1].y10) ? rl[1].y10 : null;
      push(join([
        isNum(s102) && `10−2y ${b(sgn(Math.round(s102 * 100), 0, 'bp'))}${isNum(s102p) ? ` (${bp(s102, s102p)})` : ''}`,
        isNum(s103) && `10y−3m ${sgn(Math.round(s103 * 100), 0, 'bp')}`,
        isNum(r10) && `실질 10y ${b(fmt(r10, 2))}${rp && isNum(rp[1].y10) ? ` (${bp(r10, rp[1].y10)})` : ''}`,
        isNum(r10) && isNum(n.y10) && `BEI ${fmt(n.y10 - r10, 2)}`,
      ]));
      // 정책금리는 지금 적용 중이라 남긴다. SOFR·EFFR·OAS 는 세션일 값일 때만.
      const sofr = rr('sofr'), effr = rr('effr');
      const sl = sofr.length ? sofr[sofr.length - 1] : null, el = effr.length ? effr[effr.length - 1] : null;
      const hy = lv(FRED, 'hy_oas'), ig = lv(FRED, 'ig_oas');
      L.push(join([ff && `연방기금 상단 ${ff.txt}%`, el && usFresh(el[0]) && `EFFR ${fmt(el[1], 2)}`, sl && usFresh(sl[0]) && `SOFR ${fmt(sl[1], 2)}`,
        hy && usFresh(hy.d) && `HY OAS ${hy.txt}%p`, ig && usFresh(ig.d) && `IG ${ig.txt}%p`]));
    }

    // 달러·원자재 — 야후
    const cm = (k, nm, d, pre = '') => { const q = fy(k); return q ? `${nm} ${pre}${b(fmt(q.v, d))} (${sgn(q.pct, 1, '%')})` : null; };
    const fxLine = join([cm('dxy', 'DXY', 2), cm('krw', '원/달러', 1), cm('gold', '금', 0, '$')]);
    const cmLine = join([cm('brent', '브렌트', 2, '$'), cm('wti', 'WTI', 2, '$'), cm('natgas', '천연가스', 2, '$')]);
    if (fxLine || cmLine) {
      L.push('');
      L.push(b('💱 달러·원자재') + ' (전일비)');
      push(fxLine);
      push(cmLine);
    }
  }

  // ── 한국 ── 직전 평일 이후 값만. 월간 CPI 는 뺀다.
  if (ECOS) {
    const kf = (o) => (o && krFresh(o.d) ? o : null);
    const br = lv(ECOS, 'base_rate', 2), K3 = kf(lv(ECOS, 'ktb3', 3)), K10 = kf(lv(ECOS, 'ktb10', 3)), AA = kf(lv(ECOS, 'corp_aa', 3)), FX = kf(lv(ECOS, 'usdkrw', 1)), KS = kf(lv(ECOS, 'kospi', 2));
    const fn = rows(ECOS, 'foreign_net');
    const FN = fn.length && krFresh(fn[fn.length - 1][0]);
    const f5 = fn.slice(-5).reduce((a, r) => a + r[1], 0);
    const ksp = KS && isNum(KS.diff) ? (KS.diff / (KS.v - KS.diff)) * 100 : null;
    const rateLine = join([K3 && `국고3y ${b(K3.txt)}% (${bp(K3.v, K3.v - K3.diff)})`, K10 && `10y ${K10.txt}% (${bp(K10.v, K10.v - K10.diff)})`,
      AA && K3 && AA.d === K3.d && `AA− 스프레드 ${sgn(Math.round((AA.v - K3.v) * 1000) / 10, 1, 'bp')}`]);
    const mktLine = join([FX && `원/달러 ${b(fmt(FX.v, 1))} (${FX.chg})`, KS && `KOSPI ${fmt(KS.v, 0)} ${b(sgn(ksp, 2, '%'))}`,
      FN && `외국인 ${b(sgn(fn[fn.length - 1][1] / 1e4, 2, '조'))} (5일 ${sgn(f5 / 1e4, 2, '조')})`]);
    if (rateLine || mktLine) {
      const kd = (K3 || KS || FX || {}).d || (FN ? fn[fn.length - 1][0] : '');
      L.push('');
      L.push(b('🇰🇷 한국') + ` (ECOS ${md(kd)})` + (br ? ` · 기준금리 ${br.txt}%` : ''));
      push(rateLine);
      push(mktLine);
    }
  }

  // ── 발표 결과(전일·금일) · 이번 주 일정 ──
  if (CONS && CONS.events) {
    const evs = Object.values(CONS.events).map((e) => ({ ...e, k: etToKst(e.date) }));
    const to = new Date(kstNow.getTime() + 7 * 24 * 3600000).toISOString().slice(0, 10);
    const done = evs.filter((e) => e.actual != null && e.k.date >= prevWk && e.k.date <= today).sort((a, c) => a.date.localeCompare(c.date));
    const up = evs.filter((e) => e.actual == null && e.k.date >= today && e.k.date <= to && e.impact !== 'Low').sort((a, c) => a.date.localeCompare(c.date));
    if (done.length) {
      L.push('');
      L.push(b('✅ 발표 결과') + ' (실제 / 예상 → 판정)');
      for (const e of done) push(`${md(e.k.date)} ${esc(e.title)} ${b(esc(String(e.actual) + (e.unit || '')))} / ${esc(e.forecast || '—')} → ${b(esc(e.verdict || '—'))}`);
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
  L.push(`전일·금일 데이터만 · 미국 재무부·야후·뉴욕연은 · 한국 ECOS · 발표 ForexFactory·FRED · <a href="${LINK}">대시보드</a>`);
  return body ? L.join('\n') : '';
}

const html = build();
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'out', 'digest.html'), html, 'utf8');
fs.writeFileSync(path.join(ROOT, 'out', 'digest.txt'), html.replace(/<a href="([^"]+)">([^<]*)<\/a>/g, '$2 $1').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), 'utf8');
console.log(html ? `→ out/digest.html (${html.replace(/<[^>]+>/g, '').length}자)` : '보낼 전일·금일 데이터 없음 — out/digest.html 비움(전송 SKIP)');
