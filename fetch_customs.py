"""
fetch_customs.py — 관세청 품목별·국가별 수출실적 API(공공데이터포털 15100475)로 104품목 워크북보다 새로운 달을 받아
data/customs-hs.json 에 저장한다. extract.py 가 이 파일로 워크북의 (E) 월을 월전체 실측으로 바꾼다.

왜 PC 에서 도는가: 이 API(apis.data.go.kr/1220000/nitemtrade)는 해외 IP(GitHub Actions 서버)에 403 을 준다
(전력기기 대시보드에서 확인). 그래서 수집만 이 PC 가 하고, 결과 파일을 main 에 커밋하면 GitHub 루틴이 빌드한다.
  → customs-daily.ps1 이 git pull → 이 스크립트 → 바뀌었으면 커밋·푸시·워크플로 실행까지 한다.

실행:
  python fetch_customs.py                 # 워크북 최신 실측월 다음 달이 API 에 올라왔을 때만 전체 수집
  python fetch_customs.py --target=2026-08 --base=2026-07   # 검증용: 이미 실측인 달을 다시 받아 재계산 결과를 워크북과 대조

키: 이 폴더 .env 의 CUSTOMS_API_KEY, 없으면 삼전&닉스/반도체가격/.env 를 읽기 전용으로 빌려 쓴다(값은 출력하지 않는다).
종료 코드: 0 = 정상(새 달 없음 포함), 1 = 오류.
"""
import os, re, sys, json, time, datetime as dt, urllib.request, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import extract  # 워크북 파서 재사용 (extract_exports, newest)

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'data', 'customs-hs.json')
EP = 'https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList'
ENV_FILES = [os.path.join(ROOT, '.env'), r'C:\Users\rsm86\OneDrive\문서\삼전&닉스\반도체가격\.env']
PROBE_HS = '8542321010'  # DRAM — 가장 먼저 집계되는 대표 품목으로 새 달 공개 여부만 본다


def arg(name):
    for a in sys.argv[1:]:
        if a.startswith('--' + name + '='):
            return a.split('=', 1)[1]
    return None


def load_key():
    for k in ('CUSTOMS_API_KEY', 'DATA_GO_KR_KEY'):
        if os.environ.get(k):
            return os.environ[k]
    for f in ENV_FILES:
        if not os.path.exists(f):
            continue
        found = {}
        for line in open(f, encoding='utf-8'):
            m = re.match(r'^\s*(CUSTOMS_API_KEY|DATA_GO_KR_KEY)\s*=\s*(.*)$', line)
            if m:
                found[m.group(1)] = m.group(2).strip().strip('"\'')
        for k in ('CUSTOMS_API_KEY', 'DATA_GO_KR_KEY'):  # 반도체가격 fetch.js 와 같은 우선순위
            if found.get(k):
                return found[k]
    raise SystemExit('관세청 API 키 없음 (.env 의 CUSTOMS_API_KEY)')


KEY = None
_last = [0.0]


def call(hs, start, end):
    """hs 접두 코드 한 개, 최대 12개월 구간 → [(ym, statCd, name, usd, kg)]"""
    sk = KEY if re.search(r'%[0-9A-Fa-f]{2}', KEY) else urllib.parse.quote(KEY, safe='')
    url = f'{EP}?serviceKey={sk}&strtYymm={start.replace("-", "")}&endYymm={end.replace("-", "")}&hsSgn={hs}'
    for attempt in range(4):
        gap = time.time() - _last[0]
        if gap < 0.4:
            time.sleep(0.4 - gap)
        try:
            _last[0] = time.time()
            xml = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'bok-monitor'}), timeout=60).read().decode('utf-8')
            if '<resultCode>00</resultCode>' not in xml:
                raise RuntimeError(xml[:200])
            rows = []
            for it in re.findall(r'<item>([\s\S]*?)</item>', xml):
                g = lambda t: (re.search(f'<{t}>([^<]*)</{t}>', it) or [None, None])[1]
                y = g('year')
                if not y or not re.match(r'^\d{4}\.\d{2}$', y):
                    continue  # 총계 행
                rows.append((y.replace('.', '-'), g('statCd'), g('statCdCntnKor1'), float(g('expDlr') or 0), float(g('expWgt') or 0)))
            return rows
        except Exception as e:  # 일시 오류는 재시도, 키·파라미터 오류는 그대로 던진다
            if attempt == 3 or 'SERVICE_KEY' in str(e):
                raise RuntimeError(f'관세청 API 실패 hs={hs} {start}~{end}: {str(e)[:160]}')
            time.sleep(3 * (attempt + 1))


def ym_add(ym, k):
    y, m = map(int, ym.split('-'))
    t = y * 12 + (m - 1) + k
    return f'{t // 12:04d}-{t % 12 + 1:02d}'


# 워크북 HS 표기와 실제 집계 범위가 다른 품목 — 2026-06~08 금액·중량을 하위 코드 조합으로 역추적해 맞춘 값(2026-10-01)
HS_FIX = {
    '셀룰로오스': '391239',                              # 표기 3912.90 → 실제 3912.39 (금액·중량 완전 일치)
    '공작기계': '8457 8458',                             # 표기 8479.50 → 머시닝센터·선반 (오차 0.5%)
    '합성고무': '400219 400220 400259',                   # 표기 4002.19.0000 4002.20.9000 → 6단위 3개 (오차 0.1%)
    '농업용 트랙터': '870191 870192 870193 870194',        # 표기 8701 → 8701.91~94 (완전 일치)
}
SCALE_OVER = 2.0  # 기준월 워크북 대비 차이가 이 %를 넘으면 새 달 값을 기준월 비율(워크북÷API)로 보정한다


def codes_of(hs, name=None):
    return [c.replace('.', '') for c in str(HS_FIX.get(name, hs)).split() if c.strip()]


def main():
    global KEY
    KEY = load_key()
    ex = extract.extract_exports(extract.newest('한국 수출통계*.xlsx'))
    base = arg('base') or ex['latestActual']                     # 워크북 최신 실측월
    this_month = dt.date.today().strftime('%Y-%m')
    if arg('target'):
        target = arg('target')
    else:
        start = ym_add(base, 1)
        if start >= this_month:
            print(f'새 달 후보 없음 (워크북 실측 {base}, 이번 달 {this_month})'); return 0
        got = sorted({r[0] for r in call(PROBE_HS, start, ym_add(this_month, -1))})
        if not got:
            print(f'관세청 API 에 {start} 이후 자료 아직 없음 (워크북 실측 {base})'); return 0
        target = got[-1]
    months = [ym_add(target, k) for k in range(-23, 1)]               # 24개월: 국가별 누적 Y/Y 까지 계산
    print(f'수집: 워크북 실측 {base} → 목표 {target} · 구간 {months[0]}~{months[-1]}')

    want_ctry = {name: {c['code'] for c in v['countries'].values()} for name, v in ex['country']['items'].items()}
    cache = {}
    items = {}
    n_calls = 0
    for cat in ex['categories']:
        for it in cat['items']:
            key = f"{cat['sheet']}|{it['name']}"
            amt, wt, ctry = {}, {}, {}
            for code in codes_of(it['hs'], it['name']):
                if code not in cache:
                    rows = []
                    for s, e in ((months[0], months[11]), (months[12], months[23])):
                        rows += call(code, s, e); n_calls += 1
                    cache[code] = rows
                for ym, cc, cname, usd, kg in cache[code]:
                    amt[ym] = amt.get(ym, 0) + usd / 1e6
                    wt[ym] = wt.get(ym, 0) + kg / 1e3
                    if cc in want_ctry.get(it['name'], ()):
                        c = ctry.setdefault(cc, {'name': cname, 'amt': {}})
                        c['amt'][ym] = c['amt'].get(ym, 0) + usd / 1e6
            items[key] = {'cat': cat['sheet'], 'name': it['name'], 'hs': it['hs'], 'hsUsed': ' '.join(codes_of(it['hs'], it['name'])),
                          'amt': {k: round(v, 6) for k, v in sorted(amt.items())},
                          'wt': {k: round(v, 3) for k, v in sorted(wt.items())},
                          'countries': {cc: {'name': c['name'], 'amt': {k: round(v, 6) for k, v in sorted(c['amt'].items())}} for cc, c in ctry.items()}}
    # 같은 원천인지 확인: 워크북 실측월(base) 품목 금액 대조
    ia = ex['months'].index(base)
    diffs = []
    for cat in ex['categories']:
        for it in cat['items']:
            v = items[f"{cat['sheet']}|{it['name']}"]
            w = it['amt'][ia]; a = v['amt'].get(base, 0)
            if w:
                d = abs(a / w - 1) * 100
                diffs.append((d, it['name']))
                if d > SCALE_OVER and a:
                    v['scale'] = round(w / a, 6)   # extract.py 가 새 달 금액·중량에 곱한다 (ASP 는 그대로)
    diffs.sort(reverse=True)
    over = [f'{n} {d:.2f}%' for d, n in diffs if d > 1]
    check = {'month': base, 'items': len(diffs), 'maxDiffPct': round(diffs[0][0], 3) if diffs else None, 'over1pct': over[:20]}
    print(f'대조 {base}: {len(diffs)}품목 · 최대 차이 {check["maxDiffPct"]}% · 1% 넘는 품목 {len(over)}개 {over[:5]}')
    # 새 달이 대표 품목만이 아니라 전체에 들어왔는지
    have = sum(1 for v in items.values() if v['amt'].get(target))
    print(f'{target} 자료가 있는 품목 {have}/{len(items)} · API 호출 {n_calls}회')
    out = {'source': '관세청 품목별 국가별 수출입실적 (공공데이터포털 15100475, 통관 기준)', 'url': 'https://www.data.go.kr/data/15100475/openapi.do',
           'fetchedAt': dt.datetime.now().strftime('%Y-%m-%d %H:%M'), 'workbookBase': base, 'latestMonth': target, 'months': months,
           'check': check, 'itemsWithTarget': have, 'items': items}
    path = arg('out') or OUT
    old = None
    if os.path.exists(path):
        try:
            old = json.load(open(path, encoding='utf-8'))
        except Exception:
            pass
    if old and {k: v for k, v in old.items() if k != 'fetchedAt'} == {k: v for k, v in out.items() if k != 'fetchedAt'}:
        print('내용 변화 없음 — 파일 유지'); return 0
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(out, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'→ {path} · {os.path.getsize(path) / 1024:.0f}KB · 최신 {target}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
