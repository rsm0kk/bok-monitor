/**
 * daily.js — 하루 한 번 도는 배치. 순서:
 *   1) extract.py   data/ 의 최신 xlsx 2종 → out/data.json   (파일이 바뀌지 않았으면 결과도 같다)
 *   2) fetch-ecos.js 보고서 이후 최신치 → cache/ecos.json     (실패해도 옛 캐시로 진행)
 *   2b) fetch-fred.js 미국 매크로 → cache/fred.json             (실패해도 옛 캐시로 진행)
 *   2c) fetch-consensus.js 이번 주 컨센서스 스냅샷 + 발표 판정 → cache/consensus.json
 *   3) build.js     → out/index.html (+ out/fig)
 *   4) audit.js     공개 가능 여부 검사
 *   5) deploy-site.js → GitHub Pages (검사 통과 시에만)
 * 기록: logs/daily.log 한 회차 한 블록. 예약 작업 "BOK Monitor Daily" 가 매일 16:30 에 부른다.
 */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const LOG = path.join(ROOT, 'logs', 'daily.log');
fs.mkdirSync(path.dirname(LOG), { recursive: true });
const stamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
const lines = [`=== ${stamp()} ===`];
const say = (s) => { lines.push(s); console.log(s); };

function run(label, cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 600000 });
  const out = ((r.stdout || '') + (r.stderr || '')).trim().split(/\r?\n/).filter(Boolean);
  say(`[${label}] exit ${r.status}${out.length ? ' · ' + out.slice(-2).join(' / ') : ''}`);
  return r.status === 0;
}

const ok1 = run('extract', 'python', ['extract.py']);
run('ecos', 'node', ['fetch-ecos.js']);
run('fred', 'node', ['fetch-fred.js']);
run('consensus', 'node', ['fetch-consensus.js']);
run('yahoo', 'node', ['fetch-yahoo.js']);
const ok3 = ok1 && run('build', 'node', ['build.js']);
if (ok3) run('deploy', 'node', ['deploy-site.js']);
else say('deploy 건너뜀 — 앞 단계 실패');
fs.appendFileSync(LOG, lines.join('\n') + '\n', 'utf8');
