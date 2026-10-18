"""Portable local Carousel preview. Python 3.9+; standard library only."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse, functools, hashlib, json
base=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=4200);args=parser.parse_args()
for name,meta in json.loads((base/'manifest.json').read_text()).items():
 p=base/'public'/name
 if hashlib.sha256(p.read_bytes()).hexdigest()!=meta['sha256']:raise SystemExit('Checkpoint file differs: '+name)
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
class Server(ThreadingHTTPServer):request_queue_size=128
print(f'Carousel: http://127.0.0.1:{args.port}/experiments/carnival/index.html?scene=rides-games',flush=True)
try:Server(('127.0.0.1',args.port),functools.partial(Handler,directory=str(base/'public'))).serve_forever()
except KeyboardInterrupt:pass
