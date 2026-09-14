/**
 * build.js — template.html + out/data.json + cache/ecos.json + notes.json + data/figures/00_그림목록.csv
 *            → out/index.html (단일 파일, 외부 의존 없음)
 *
 * 그림(188개 PNG)은 파일에 내장하지 않는다(10MB). GitHub Pages 저장소의 fig/ 폴더로 따로 올리고
 * 화면의 '자료' 탭이 상대경로 fig/<file> 로 참조한다. 로컬에서 index.html 만 열면 그림 칸은 비어 보인다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const tpl = read('template.html');
const data = JSON.parse(read('out/data.json'));
const notes = JSON.parse(read('notes.json'));
let ecos = null;
try { ecos = JSON.parse(read('cache/ecos.json')); } catch { /* 미연동이면 화면에서 안내 */ }
let fred = null;
try { fred = JSON.parse(read('cache/fred.json')); } catch { /* 미연동이면 미국 탭에서 안내 */ }
let yahoo = null;
try { yahoo = JSON.parse(read('cache/yahoo.json')); } catch { /* 없으면 FRED 값만 */ }
let consensus = null;
try { consensus = JSON.parse(read('cache/consensus.json')); } catch { /* 없으면 컨센 카드가 안내만 띄운다 */ }

// 그림 목록 CSV → [{file,page,label,title}]
let figures = [];
try {
  const csv = read('data/figures/00_그림목록.csv').replace(/^﻿/, '');
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const parse = (line) => {
    const out = []; let cur = ''; let q = false;
    for (const ch of line) {
      if (ch === '"') { q = !q; continue; }
      if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  };
  const hdr = parse(lines[0]);
  figures = lines.slice(1).map((l) => {
    const c = parse(l); const o = {};
    hdr.forEach((h, i) => { o[h] = c[i]; });
    return { file: o.file, page: Number(o.pdf_page), label: o.label || '', title: o.title || '', w: Number(o.width_px), h: Number(o.height_px) };
  }).filter((f) => f.file && f.title && f.w >= 150 && f.h >= 90); // 표지·장 제목 같은 장식 이미지는 뺀다
} catch { /* 그림 목록 없으면 갤러리만 비운다 */ }

const payload = { ...data, ecos, fred, yahoo, consensus, figures, builtAt: new Date().toISOString().slice(0, 16).replace('T', ' ') };
const safe = (s) => s.replace(/<\//g, '<\\/'); // </script> 가 데이터 안에 들어가면 문서가 깨진다

for (const ph of ['__DATA__', '__NOTES__']) {
  if (!tpl.includes(ph)) throw new Error(`template.html 에 ${ph} 자리표시자가 없습니다`);
}
const usmacro = read('usmacro.js');
if (!tpl.includes('__USMACRO__')) throw new Error('template.html 에 __USMACRO__ 자리표시자가 없습니다');
let html = tpl.replace('__DATA__', () => safe(JSON.stringify(payload))).replace('__NOTES__', () => safe(JSON.stringify(notes))).replace('__USMACRO__', () => usmacro);

// 키 유출 검사 — 이 폴더 .env 와 빌려 쓰는 매크로 모니터 .env 의 값이 산출물에 있으면 중단
const envFiles = [path.join(ROOT, '.env'), path.join(ROOT, '..', '..', '국장 매크로 모니터', '.env'), path.join(ROOT, '..', '..', '미장 요약', '.env')];
for (const v of [process.env.ECOS_API_KEY, process.env.FRED_API_KEY]) {
  if (v && v.length >= 8 && html.includes(v.trim())) throw new Error('산출물에 API 키가 포함됐습니다 — 중단');
}
for (const f of envFiles) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*[A-Z_][A-Z0-9_]*\s*=\s*"?([^"\s#]{8,})/);
    if (m && html.includes(m[1])) throw new Error('산출물에 API 키가 포함됐습니다 — 중단');
  }
}

fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'out', 'index.html'), html, 'utf8');

// 그림을 out/fig 로 복사한다(같은 크기면 건너뜀). 로컬 미리보기와 Pages 배포가 같은 상대경로 fig/ 를 쓴다.
const figSrc = path.join(ROOT, 'data', 'figures', 'images'), figDst = path.join(ROOT, 'out', 'fig');
let copied = 0;
if (fs.existsSync(figSrc)) {
  fs.mkdirSync(figDst, { recursive: true });
  for (const f of fs.readdirSync(figSrc)) {
    const s = path.join(figSrc, f), d = path.join(figDst, f);
    if (!fs.existsSync(d) || fs.statSync(d).size !== fs.statSync(s).size) { fs.copyFileSync(s, d); copied += 1; }
  }
}
console.log(`→ out/index.html · ${(Buffer.byteLength(html) / 1024).toFixed(0)}KB · 그림 ${figures.length}개(복사 ${copied}) · ECOS ${ecos ? ecos.fetchedAt : '미연동'} · FRED ${fred ? fred.fetchedAt : '미연동'}`);
