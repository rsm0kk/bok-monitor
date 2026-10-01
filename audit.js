/**
 * audit.js — out/index.html 이 공개해도 되는 단일 파일인지 검사한다. 하나라도 걸리면 exit 1 (deploy-site 가 배포를 멈춘다).
 *   1) 외부 스크립트·스타일·폰트 참조 없음 (fig/ 이미지 상대경로와 Pretendard 글꼴 링크만 허용)
 *   2) 로컬 절대경로(C:\Users…) 없음
 *   3) API 키 이름·값 흔적 없음
 *   4) 자리표시자(__DATA__/__NOTES__) 미치환 없음, <title> 있음
 */
'use strict';
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, 'out', 'index.html');
if (!fs.existsSync(f)) { console.log('FAIL out/index.html 없음'); process.exit(1); }
const raw = fs.readFileSync(f, 'utf8');
// 예외는 Pretendard 글꼴 링크 한 줄뿐(사용자 요청, 2026-10-01). 못 받아도 맑은 고딕으로 대체돼 화면은 그대로 뜬다.
const FONT = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">';
const html = raw.split(FONT).join('');
const fails = [];
if (/<script[^>]+src=/i.test(html)) fails.push('외부 스크립트 참조');
if (/<link[^>]+rel=["']stylesheet/i.test(html)) fails.push('외부 스타일시트 참조');
if (/https?:\/\/[^"'\s]*\.(woff2?|ttf|js|css)\b/i.test(html)) fails.push('외부 폰트·스크립트 URL');
if (/[A-Z]:\\Users\\/i.test(html) || /\/Users\/rsm86/.test(html)) fails.push('로컬 절대경로');
for (const k of ['ECOS_API_KEY', 'KOSIS_API_KEY', 'DART_API_KEY', 'KIS_APP_KEY', 'KIS_APP_SECRET', 'DATA_GO_KR_KEY', 'NAVER_CLIENT', 'FRED_API_KEY']) if (html.includes(k)) fails.push('키 이름 ' + k);
if (html.includes('__DATA__') || html.includes('__NOTES__') || html.includes('__USMACRO__')) fails.push('자리표시자 미치환');
if (!/<title>[^<]{5,}<\/title>/.test(html)) fails.push('<title> 없음');
if (!/<meta charset="utf-8">/i.test(html)) fails.push('charset 없음');
if (fails.length) { console.log('FAIL audit: ' + fails.join(', ')); process.exit(1); }
console.log(`audit OK · ${(Buffer.byteLength(html) / 1024).toFixed(0)}KB`);
