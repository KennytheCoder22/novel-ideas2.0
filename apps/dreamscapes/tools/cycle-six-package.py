from pathlib import Path
import subprocess, json, tarfile
app=Path(__file__).resolve().parent.parent
repo=app.parent.parent
receipt=json.loads((app/'verification/cycle-six/release-preparation.json').read_text(encoding='utf-8'))
commit=receipt['releaseCommit']
# A short staging path avoids Windows' legacy filename limit for the approved
# long artwork names. This is an inert package, not another Git checkout.
root=repo.parent/('release6-'+commit[:8])
assert root.resolve().is_relative_to(repo.parent.resolve()) and not root.exists()
root.mkdir()
names=['public','build.mjs','checkpoint/manifest.json','runtime-overrides.json','prototype-overrides.json','package.json','vercel.json','research/cycle-zora']
archive=root/'inputs.tar'
with archive.open('wb') as target:
    subprocess.run(['git','-c','gc.auto=0','-C',str(repo),'archive',commit,*['apps/dreamscapes/'+p for p in names]],stdout=target,check=True)
with tarfile.open(archive) as tar:
    for member in tar.getmembers():
        assert (root/member.name).resolve().is_relative_to(root.resolve())
        assert not member.issym() and not member.islnk()
    tar.extractall(root,filter='data')
archive.unlink()
(root/'.vercel').mkdir()
(root/'.vercel/project.json').write_text(json.dumps(dict(projectId='prj_uDp3rgzYWVvnP82Lv8dD2HFVTQNv',orgId='team_qwZFQgAcD4WFkLZmhTMjxnbX',projectName='dreamscapes-novelideas')),encoding='utf-8')
(root/'.vercelignore').write_text('apps/dreamscapes/dist\napps/dreamscapes/research/cycle-zora/verification\n',encoding='utf-8')
subprocess.run(['node','build.mjs'],cwd=root/'apps/dreamscapes',check=True)
receipt['package']=str(root)
(app/'verification/cycle-six/release-package.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print(str(root))
