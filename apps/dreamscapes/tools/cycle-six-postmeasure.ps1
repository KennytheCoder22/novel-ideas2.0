$ErrorActionPreference='Stop'
$PSDefaultParameterValues['Out-File:Encoding']='utf8'
$env:PLAYWRIGHT_MODULE='C:/Users/KenBR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:BROWSER_EXE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node tools/cycle-six-buffer-parity.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tools/cycle-six-onboard-parity.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tools/cycle-six-runtime-info.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tools/cycle-six-profile.cjs --baseline
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tools/cycle-six-profile.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
python -c "from pathlib import Path; assert Path('dist').resolve().parent==Path.cwd().resolve()"
node build.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Start-Process node -ArgumentList 'tools/cycle-six-dist-preview.mjs' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput 'playtest-artifacts/cycle-six/dist-server.log' -RedirectStandardError 'playtest-artifacts/cycle-six/dist-server-error.log'
$env:PORT='4263'
Start-Process node -ArgumentList 'tools/cycle-six-review-server.mjs' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput 'playtest-artifacts/cycle-six/review-server.log' -RedirectStandardError 'playtest-artifacts/cycle-six/review-server-error.log'
node --test tools/cycle-six-renderer.test.mjs tools/cycle-five-contract.test.mjs tools/cycle-four-contract.test.mjs tools/dream-assets.test.mjs tools/carousel-choice.test.mjs tools/observations.test.mjs tools/playtest-server.test.mjs > verification/cycle-six/unit-tests.txt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$env:DREAMSCAPES_OBSERVATION_EVIDENCE_DIR='verification/cycle-six/observations'
node tools/observation-browser.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tools/cycle-six-wheel-ready.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tools/cycle-six-zora.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$env:DREAMSCAPES_EVIDENCE_DIR='playtest-artifacts/cycle-six/regression'
node tools/playtest.cjs
exit $LASTEXITCODE
