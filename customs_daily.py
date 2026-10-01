"""
customs_daily.py — 이 PC 의 작업 스케줄러 "BOK Customs Daily"(매일 10:10·16:10)가 부른다.
관세청 품목별 수출실적 API 에 104품목 워크북보다 새 달이 올라왔는지 확인하고(fetch_customs.py),
올라왔으면 data/customs-hs.json 을 main 에 커밋·푸시한 뒤 GitHub 루틴(daily.yml)을 바로 돌린다.
관세청 API 가 GitHub 서버(해외 IP)를 막아서 수집만 PC 가 맡는다. 빌드·배포는 GitHub 루틴이 한다.
(.ps1 로 만들었더니 이 PC 에서 스크립트 파일 생성이 막혀 파이썬으로 옮겼다 — 2026-10-01)
기록: logs/customs.log
"""
import os, sys, json, time, subprocess, datetime as dt, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(ROOT, 'logs', 'customs.log')
os.makedirs(os.path.dirname(LOG), exist_ok=True)
NOWIN = getattr(subprocess, 'CREATE_NO_WINDOW', 0)


def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        for line in str(msg).rstrip().splitlines() or ['']:
            f.write(f"{dt.datetime.now():%Y-%m-%d %H:%M:%S} {line}\n")


def run(cmd, tag):
    env = dict(os.environ, PYTHONIOENCODING='utf-8', GIT_TERMINAL_PROMPT='0')
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace', env=env, creationflags=NOWIN, timeout=1500)
    out = (p.stdout + p.stderr).strip()
    if out:
        log('\n'.join(f'{tag}: {l}' for l in out.splitlines()))
    return p.returncode


def main():
    log('=== 시작')
    for _ in range(24):  # 절전에서 막 깼으면 네트워크가 늦게 올라온다 — 최대 2분
        try:
            urllib.request.urlopen('https://apis.data.go.kr', timeout=10)
            break
        except urllib.error.HTTPError:
            break
        except Exception:
            time.sleep(5)
    else:
        log('네트워크 준비 실패 — 종료'); return 1
    run(['git', 'pull', '-q', '--rebase'], 'git')
    if run([sys.executable, 'fetch_customs.py'], 'fetch') != 0:
        log('fetch_customs 실패'); return 1
    run(['git', 'add', 'data/customs-hs.json'], 'git')
    if subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=ROOT, creationflags=NOWIN).returncode == 0:
        log('변경 없음 — 끝'); return 0
    last = json.load(open(os.path.join(ROOT, 'data', 'customs-hs.json'), encoding='utf-8'))['latestMonth']
    run(['git', 'commit', '-q', '-m', f'customs: 관세청 품목별 수출실적 {last} 반영 ({dt.datetime.now():%Y-%m-%d %H:%M} KST)'], 'git')
    run(['git', 'pull', '-q', '--rebase'], 'git')
    if run(['git', 'push', '-q', 'origin', 'main'], 'git') != 0:
        log('push 실패'); return 1
    run(['gh', 'workflow', 'run', 'daily.yml', '-R', 'rsm0kk/bok-monitor'], 'gh')
    log(f'푸시·루틴 실행 완료 — 최신 {last}')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:
        log(f'오류: {e!r}'); sys.exit(1)
