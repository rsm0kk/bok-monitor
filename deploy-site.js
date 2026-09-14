/**
 * deploy-site.js — out/index.html (+ data/figures/images → fig/) 을 GitHub Pages 저장소에 올린다.
 * 국장 요약/deploy-site.js 의 사본에 '추가 폴더 복사'(extraDirs)만 더했다. 설정은 같은 폴더 pages.config.json.
 *
 *   node deploy-site.js              설정에 적힌 사이트 전부
 *   node deploy-site.js --site=NAME  하나만
 *
 * 공개 저장소라 올리기 전 검사가 전부다.
 *   1) 사이트별 audits 명령이 전부 exit 0
 *   2) secretFiles(.env 들)의 값(16자 이상)이 문서 안에 없을 것 — 값은 출력하지 않는다
 * squash: true 면 부모 없는 커밋 하나로 가지를 바꿔 끼운다(force push). 그림 10MB 가 매일 쌓이지 않게.
 * 항상 exit 0 — 배치 본체를 멈추지 않는다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const ROOT = __dirname;
const CONFIG = path.join(ROOT, 'pages.config.json');
const IDENT = ['-c', 'user.name=dashboard-bot', '-c', 'user.email=dashboard-bot@users.noreply.github.com'];
const TRAILER = '\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>';

function arg(name) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function git(repoDir, args) {
  return execFileSync('git', args, {
    cwd: repoDir, encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  }).trim();
}

function secretValues(files) {
  const out = new Set();
  const keep = (v) => { const s = String(v == null ? '' : v).trim().replace(/^["']|["']$/g, ''); if (s.length >= 16 && !/\s/.test(s) && !/^https?:/i.test(s)) out.add(s); };
  const walk = (x) => { if (x && typeof x === 'object') Object.values(x).forEach(walk); else if (typeof x === 'string') keep(x); };
  let readable = 0;
  for (const rel of files) {
    const f = path.resolve(ROOT, rel);
    if (!fs.existsSync(f)) continue;
    readable += 1;
    const text = fs.readFileSync(f, 'utf8');
    if (/\.json$/i.test(f)) { try { walk(JSON.parse(text)); } catch { text.split(/\r?\n/).forEach(keep); } }
    else for (const line of text.split(/\r?\n/)) { const m = line.match(/^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*)$/); if (m) keep(m[1].replace(/\s+#.*$/, '')); }
  }
  return { values: [...out], readable };
}

function lockBusy(repoDir) {
  const lock = path.join(repoDir, '.git', 'index.lock');
  if (!fs.existsSync(lock)) return false;
  if (Date.now() - fs.statSync(lock).mtimeMs < 15 * 60000) return true;
  fs.unlinkSync(lock);
  return false;
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) { n += copyDir(s, d); continue; }
    if (!fs.existsSync(d) || fs.statSync(d).size !== fs.statSync(s).size) fs.copyFileSync(s, d);
    n += 1;
  }
  return n;
}

function deploy(site) {
  const name = site.name;
  const src = path.resolve(ROOT, site.src);
  const repoDir = site.repoDir;
  const branch = site.branch || 'main';
  const url = site.publicUrl || repoDir;
  const secretFiles = site.secretFiles || ['.env'];

  if (!fs.existsSync(src)) return console.log(`FAIL ${name}: 공유본 없음 ${site.src}`);
  if (!repoDir || !fs.existsSync(path.join(repoDir, '.git'))) return console.log(`FAIL ${name}: repoDir 이 git 저장소가 아님 ${repoDir}`);
  if (lockBusy(repoDir)) return console.log(`SKIP ${name}: 다른 배포가 진행 중 (.git/index.lock)`);

  for (const cmd of site.audits || []) {
    try { execSync(cmd, { cwd: ROOT, stdio: 'pipe', timeout: 180000, encoding: 'utf8' }); }
    catch (e) { const tail = String(e.stdout || e.stderr || e.message).trim().split('\n').slice(-1)[0]; return console.log(`FAIL ${name}: 검사 실패 — ${cmd} · ${tail}`); }
  }

  let html = fs.readFileSync(src, 'utf8');
  const sec = secretValues(secretFiles);
  if (sec.readable === 0) return console.log(`FAIL ${name}: 비밀값 대조용 파일을 하나도 못 읽음 — 검사 없이 공개 저장소에 올리지 않는다`);
  const leaked = sec.values.filter((v) => html.includes(v)).length;
  if (leaked) return console.log(`FAIL ${name}: 비밀값 ${leaked}건이 문서에 들어 있음 — 배포 중단`);

  if (site.noindex !== false && !/name=["']robots["']/i.test(html)) {
    const tag = '<meta name="robots" content="noindex, nofollow">';
    const HEAD = /<head(?:\s[^>]*)?>/i;
    html = HEAD.test(html) ? html.replace(HEAD, (m) => `${m}\n${tag}`) : `${tag}\n${html}`;
  }

  const files = ['index.html', '.nojekyll'];
  fs.writeFileSync(path.join(repoDir, 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(repoDir, '.nojekyll'), '', 'utf8');
  if (site.noindex !== false) { fs.writeFileSync(path.join(repoDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8'); files.push('robots.txt'); }
  let extra = 0;
  for (const [from, to] of Object.entries(site.extraDirs || {})) {
    const s = path.resolve(ROOT, from);
    if (!fs.existsSync(s)) { console.log(`WARN ${name}: 추가 폴더 없음 ${from}`); continue; }
    extra += copyDir(s, path.join(repoDir, to)); files.push(to);
  }

  const title = ((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || name).replace(/\s+/g, ' ').trim();
  const sizeMB = (Buffer.byteLength(html) / 1048576).toFixed(2);
  const msg = `${title} (${sizeMB}MB, 그림 ${extra}개)${TRAILER}`;

  try {
    git(repoDir, ['add', '-A', ...files]);
    if (!git(repoDir, ['status', '--porcelain'])) return console.log(`${name}: 변경 없음 → ${url}`);
    if (site.squash) {
      const tree = git(repoDir, ['write-tree']);
      const commit = git(repoDir, [...IDENT, 'commit-tree', tree, '-m', msg]);
      git(repoDir, ['update-ref', `refs/heads/${branch}`, commit]);
      git(repoDir, ['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
      git(repoDir, ['push', '--force', 'origin', branch]);
      try { git(repoDir, ['reflog', 'expire', '--expire=now', '--all']); git(repoDir, ['gc', '--prune=now', '--quiet']); } catch { /* 로컬 정리 실패는 무관 */ }
    } else {
      git(repoDir, [...IDENT, 'commit', '-q', '-m', msg]);
      git(repoDir, ['push', 'origin', branch]);
    }
    console.log(`${name}: 배포 ${title} · ${sizeMB}MB · 그림 ${extra}개 · 비밀값 ${sec.values.length}개 대조 통과 → ${url}`);
  } catch (e) {
    const tail = String(e.stderr || e.message || '').split('\n').filter(Boolean).slice(-2).join(' / ');
    console.log(`FAIL ${name}: git — ${tail}`);
  }
}

function main() {
  if (!fs.existsSync(CONFIG)) { console.log('SKIP GitHub Pages 미설정 (pages.config.json 없음)'); return; }
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch (e) { console.log(`FAIL pages.config.json 파싱 실패: ${e.message}`); return; }
  const only = arg('site');
  const sites = (cfg.sites || []).filter((s) => !only || s.name === only);
  if (!sites.length) { console.log(`SKIP 대상 사이트 없음${only ? ` (--site=${only})` : ''}`); return; }
  for (const s of sites) { try { deploy(s); } catch (e) { console.log(`FAIL ${s.name}: ${e.message}`); } }
}

main();
process.exit(0);
