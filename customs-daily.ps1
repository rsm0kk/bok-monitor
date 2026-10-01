# customs-daily.ps1 — 이 PC 에서 매일: 관세청 품목별 수출실적 API 에 104품목 워크북보다 새 달이 올라왔는지 확인하고,
# 올라왔으면 data/customs-hs.json 을 main 에 커밋·푸시한 뒤 GitHub 루틴(daily.yml)을 바로 돌린다.
# 관세청 API 가 GitHub 서버(해외 IP)를 막아서 수집만 PC 가 맡는다. 빌드·배포는 그대로 GitHub 루틴이 한다.
# 작업 스케줄러 "BOK Customs Daily" 가 부른다. 기록: logs/customs.log (한 회차 한 블록)
$ErrorActionPreference = "Continue"
$Repo = "C:\Users\rsm86\bok-monitor-src"
$Py = if (Test-Path "C:\Python314\python.exe") { "C:\Python314\python.exe" } else { "python" }
$LogDir = Join-Path $Repo "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$Log = Join-Path $LogDir "customs.log"
function Log([string]$m) { Add-Content -Path $Log -Value ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m) -Encoding UTF8 }
$env:PYTHONIOENCODING = "utf-8"
Set-Location $Repo
Log "=== 시작"

# 절전에서 막 깼으면 네트워크가 늦게 올라온다 — 최대 2분 대기
$net = $false
for ($i = 0; $i -lt 24; $i++) {
    try { $null = Invoke-WebRequest -Uri "https://apis.data.go.kr" -UseBasicParsing -TimeoutSec 10 -Method Head; $net = $true; break }
    catch { if ($_.Exception.Response) { $net = $true; break }; Start-Sleep -Seconds 5 }
}
if (-not $net) { Log "네트워크 준비 실패 — 종료"; exit 1 }

git pull -q --rebase 2>&1 | ForEach-Object { Log "git: $_" }
& $Py fetch_customs.py 2>&1 | ForEach-Object { Log "$_" }
if ($LASTEXITCODE -ne 0) { Log "fetch_customs 실패 exit=$LASTEXITCODE"; exit 1 }

git add data/customs-hs.json 2>$null
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Log "변경 없음 — 끝"; exit 0 }
$last = (Get-Content data/customs-hs.json -Raw -Encoding UTF8 | ConvertFrom-Json).latestMonth
git commit -q -m "customs: 관세청 품목별 수출실적 $last 반영 ($(Get-Date -Format 'yyyy-MM-dd HH:mm') KST)" 2>&1 | ForEach-Object { Log "git: $_" }
git pull -q --rebase 2>&1 | ForEach-Object { Log "git: $_" }
git push -q origin main 2>&1 | ForEach-Object { Log "git: $_" }
if ($LASTEXITCODE -ne 0) { Log "push 실패"; exit 1 }
gh workflow run daily.yml -R rsm0kk/bok-monitor 2>&1 | ForEach-Object { Log "gh: $_" }
Log "푸시·루틴 실행 완료 — 최신 $last"
exit 0
