$ErrorActionPreference='Stop'
$env:PLAYWRIGHT_MODULE='C:/Users/KenBR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:BROWSER_EXE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
$cases=@(@('adults-desktop','dragon'),@('adults-phone','horse'),@('teens-desktop','rocket'),@('teens-phone','griffin'),@('kids-desktop','elephant'),@('kids-phone','snail'))
foreach($case in $cases){foreach($variant in @('baseline','final')){node tools/cycle-six-performance.cjs --variant=$variant --video --only=$($case[0]) --mount=$($case[1]);if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}}}
