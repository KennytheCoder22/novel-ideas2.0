from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse,unquote
import argparse
HERE=Path(__file__).resolve().parent
PUBLIC=HERE.parents[1]/'public'
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(PUBLIC),**kw)
 def log_message(self,*a):pass
 def do_GET(self):
  path=unquote(urlparse(self.path).path)
  if path.startswith('/__texture_trial/'):
   relative=path[len('/__texture_trial/'):];source=HERE.parents[1]/'source-assets/carousel-variants' if relative.startswith('original/') else HERE/'copies'
   f=(source/(relative[len('original/'):] if relative.startswith('original/') else relative)).resolve()
   if not f.is_relative_to(source.resolve()) or not f.is_file():self.send_error(404);return
   b=f.read_bytes();self.send_response(200);self.send_header('Content-Type','model/gltf-binary');self.send_header('Content-Length',str(len(b)));self.send_header('Cache-Control','public,max-age=3600');self.end_headers();self.wfile.write(b);return
  if path.endswith('/mount-variants.js') or path=='/age-band.js' or path.endswith('/carousel.js'):
   f=PUBLIC/path.lstrip('/');s=f.read_text(encoding='utf-8')
   if path.endswith('/mount-variants.js'):
    s+='''\nconst trial=new URLSearchParams(location.search).get('textureTrial');
if(['original','jpeg85','jpeg75','budget'].includes(trial))for(const [id,mapping] of Object.entries(mountVariants))for(const style of ['plain','stuffed'])mapping[style].url='/__texture_trial/'+trial+'/'+style+'/'+id+'.glb';
'''
   if path=='/age-band.js':
    s="const trialBand=new URLSearchParams(location.search).get('age');if(['kids','teens','adults'].includes(trialBand))localStorage.setItem('dreamscapes.age-band',trialBand);\n"+s
   if path.endswith('/carousel.js'):
    s=s.replace('function active(){',"window.setTextureTrialPhase=(phase)=>{elapsed=phase*PERIOD;paint();};\n      function active(){")
   b=s.encode();self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Content-Length',str(len(b)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(b);return
  super().do_GET()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=4211);a=p.parse_args();print('Texture trials on http://127.0.0.1:'+str(a.port),flush=True);ThreadingHTTPServer(('127.0.0.1',a.port),Handler).serve_forever()
