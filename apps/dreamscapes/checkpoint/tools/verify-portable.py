"""Validate portable Carousel; Python standard library only."""
from pathlib import Path
from urllib.parse import urlsplit,unquote
import argparse,hashlib,json,re,struct,subprocess
root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--require-tracked',action='store_true');args=parser.parse_args()
public=root/'public';manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'));errors=[]
for name,meta in manifest.items():
 f=public/name
 if not f.is_file():errors.append('Missing runtime file: '+name);continue
 b=f.read_bytes()
 if len(b)!=meta['bytes'] or hashlib.sha256(b).hexdigest()!=meta['sha256']:errors.append('Runtime hash differs: '+name)
actual={f.relative_to(public).as_posix() for f in public.rglob('*') if f.is_file()}
if actual!=set(manifest):errors.append('Manifest/runtime inventory differs')
scene=public/'experiments/carnival';animal=(scene/'animal-comparison.js').read_text(encoding='utf-8')
names=re.findall(r"\{name:'([^']+)'",animal)+['horse-comparison'];models=[]
for name in names:
 f=scene/'carousel'/(name+'.glb')
 if not f.exists():errors.append('Missing mounted GLB: '+name);continue
 b=f.read_bytes();n=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+n]);uris=[x['uri'] for kind in ['buffers','images'] for x in doc.get(kind,[]) if 'uri' in x and not x['uri'].startswith('data:')]
 if uris:errors.append('External GLB dependency: '+name)
 models.append(f.name)
if len(set(models))!=20:errors.append('Expected 20 mounted GLBs')
for f in public.rglob('*'):
 if f.suffix not in ['.js','.css','.html']:continue
 s=f.read_text(encoding='utf-8');s=re.sub(r'/\*[\s\S]*?\*/','',s);s=re.sub(r'^\s*//.*$','',s,flags=re.M);refs=[]
 if f.suffix=='.js':refs+=re.findall(r"(?:\}\s*from\s*|\bimport\s*(?:[^;\n]+?\bfrom\s*)?)['\"]([^'\"]+)['\"]",s)
 if f.suffix=='.html':refs+=re.findall(r"(?:src|href)\s*=\s*['\"]([^'\"]+)['\"]",s)
 if f.suffix=='.css':refs+=re.findall(r"url\(\s*['\"]?([^'\")]+)",s)
 for ref in refs:
  if ref.startswith(('#','data:')):continue
  if ref.startswith(('http:','https:','//','file:')):errors.append('Nonlocal runtime dependency: '+ref);continue
  rel=unquote(urlsplit(ref).path);target=(public/rel.lstrip('/')) if rel.startswith('/') else (f.parent/rel)
  if not target.is_file():errors.append('Missing local reference: '+str(f.relative_to(public))+' -> '+ref)
 if 'vendor' not in f.parts and re.search(r'(?:[\s\"\']+[A-Za-z]:[/\\]|file://|yvhs-site-fs2)',s):errors.append('Machine-specific path in '+str(f.relative_to(public)))
slots=json.loads((root/'occupancy/scene-data.json').read_text(encoding='utf-8'))['slots']
if len(slots)!=20 or any(e['occupant']=='EMPTY' for e in slots):errors.append('Occupancy does not match 20 occupied / 0 empty')
source=root/'source-assets/rocket-original.glb';cleanup=json.loads((root/'rocket-cleanup-report.json').read_text(encoding='utf-8'))
if hashlib.sha256(source.read_bytes()).hexdigest()!=cleanup['sourceSha256']:errors.append('Original Rocket source differs')
if args.require_tracked:
 repo=root.parent
 tracked=set(subprocess.check_output(['git','ls-files','-z'],cwd=repo).decode().split('\0'))
 for f in root.rglob('*'):
  if f.is_file() and f.relative_to(repo).as_posix() not in tracked:errors.append('Untracked checkpoint file: '+str(f.relative_to(repo)))
 guard=json.loads(subprocess.check_output(['git','show','HEAD:vercel.json'],cwd=repo))
 if guard.get('git',{}).get('deploymentEnabled') is not False:errors.append('Git deployment guard absent')
 workflows=subprocess.check_output(['git','ls-tree','-r','--name-only','HEAD','.github/workflows'],cwd=repo).decode().strip()
 if workflows:errors.append('Review deployment workflow before pushing: '+workflows)
if errors:raise SystemExit('\n'.join(errors))
print(f'PASS: {len(manifest)} runtime hashes; {len(models)} embedded GLBs; local dependencies; 20 occupied / 0 empty; Rocket recovery source'+('; Git tracking and deployment guard' if args.require_tracked else ''))
