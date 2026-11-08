# Prepare an app-scoped release commit without changing any checkout or user files.
from pathlib import Path
import os,subprocess,json
app=Path(__file__).resolve().parent.parent
repo=app.parent.parent
index=app/'playtest-artifacts/cycle-six/release.index'
assert index.resolve().is_relative_to(app.resolve())
env=os.environ.copy();env['GIT_INDEX_FILE']=str(index)
def git(*args,**kw):
 return subprocess.check_output(['git','-c','gc.auto=0','-C',str(repo),*args],env=env,text=True,**kw).strip()
source=git('rev-parse','HEAD');parent=git('rev-parse','origin/main')
git('read-tree',parent)
# Overlay only the reviewed application paths; retain unrelated main files and
# historical assets not consumed by the new index/runtime manifest.
paths=['public','tools','research','build.mjs','checkpoint/manifest.json','runtime-overrides.json','prototype-overrides.json','package.json','vercel.json','.gitattributes']
paths += [p.relative_to(app).as_posix() for p in (app/'verification/cycle-six').rglob('*') if p.is_file() and p.suffix in {'.json','.html','.txt'} and p.name not in {'work-state.json','release-preparation.json','release-package.json'}]
git('restore','--staged','--overlay','--source='+source,'--',*['apps/dreamscapes/'+p for p in paths])
tree=git('write-tree')
changed=git('diff','--name-only',parent,tree).splitlines()
assert changed and all(p.startswith('apps/dreamscapes/') for p in changed)
message='Release approved Dreamscapes with verified carousel rendering optimizations\n\nReviewed local source '+source+'. All changes are confined to apps/dreamscapes.\n'
commit=git('commit-tree',tree,'-p',parent,input=message)
branch='codex/dreamscapes-cycle-six-release'
git('update-ref','refs/heads/'+branch,commit,'0'*40)
receipt={'sourceCommit':source,'parentMain':parent,'releaseCommit':commit,'branch':branch,'changedFiles':changed,'outsideAppChanges':0}
(app/'verification/cycle-six/release-preparation.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in receipt.items() if k!='changedFiles'}))
