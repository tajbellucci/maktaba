# Records the app screens for the how-to video.
#   powershell -File record\run-record.ps1                       (all screens, one session)
#   powershell -File record\run-record.ps1 -Groups "issue,loans-lists" -Port 9642   (some steps only)
# Step names: home,list (always) category search hover detail sort add edit attach-pair attach-docs
#             docx-reader pdf-map fts issue loans-lists delete publish appearance cats cover
# Run groups one after another, never at the same time (they share one settings file).
param([string]$Groups = "", [int]$Port = 9650)
$Here = $PSScriptRoot
$VID = Split-Path $Here
$D = (Resolve-Path "$VID\..\..\desktop").Path
$R = "$D\shared\repo.js"
$Work = Join-Path $env:TEMP "maktaba-record"
$Books = (Resolve-Path "$VID\..\..\books.json").Path
New-Item -ItemType Directory $Work -Force | Out-Null
if ((Get-Content $R -Raw) -match 'supabaseUrl:\s*""') { throw "shared\repo.js already has blank server settings (an earlier recording was cut short). Restore it with: git checkout desktop/shared/repo.js" }
$h0 = (Get-FileHash $R).Hash; $bak = "$Work\repo.js.bak"; Copy-Item $R $bak -Force
try {
  # The app's server settings are blanked ONLY for the recording, so the test copy acts as the librarian PC
  # and can never touch the live catalogue. They are put back below and checked by hash.
  $c = Get-Content $R -Raw -Encoding utf8
  $c = [regex]::Replace($c, 'supabaseUrl:\s*"[^"]*"', 'supabaseUrl: ""'); $c = [regex]::Replace($c, 'supabaseAnonKey:\s*"[^"]*"', 'supabaseAnonKey: ""')
  [IO.File]::WriteAllText($R, $c)
  $ud = "$Work\ud-$Port"; $dd = "$ud (dev)"
  if (Test-Path $dd) { [IO.Directory]::Delete($dd, $true) }
  New-Item -ItemType Directory "$dd\files" -Force | Out-Null
  Copy-Item $Books "$dd\books.json" -Force
  '{"isLibrarian":true}' | Set-Content "$dd\settings.json" -Encoding utf8
  Copy-Item "$Here\files\*" "$dd\files" -Force
  Start-Process "$D\node_modules\.bin\electron.cmd" -ArgumentList ".", "--user-data-dir=`"$ud`"", "--remote-debugging-port=$Port", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling" -WorkingDirectory $D -WindowStyle Hidden
  Start-Sleep 11
  $ws = ((Invoke-RestMethod "http://127.0.0.1:$Port/json") | ? type -eq page | select -First 1).webSocketDebuggerUrl
  $env:SHOT_DIR = "$VID\screens"; $env:RECTS_OUT = "$VID\rects.json"; $env:GROUPS = $Groups
  Push-Location $Here; node cdp.js $ws t-record.js 2>&1; Pop-Location
} finally {
  Get-CimInstance Win32_Process | ? { $_.CommandLine -match [regex]::Escape("ud-$Port") } | % { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Copy-Item $bak $R -Force
  "repo.js restored, hash matches: " + ((Get-FileHash $R).Hash -eq $h0)
}
