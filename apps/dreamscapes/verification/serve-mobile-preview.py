"""Local public-only preview with the production /carnival/ route alias."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?', 1)[0] == '/carnival':
            self.path = self.path.replace('/carnival', '/experiments/carnival/', 1)
        elif self.path.startswith('/carnival/'):
            self.path = self.path.replace('/carnival/', '/experiments/carnival/', 1)
        super().do_GET()

parser = argparse.ArgumentParser()
parser.add_argument('--bind', default='127.0.0.1')
parser.add_argument('--port', type=int, default=4213)
args = parser.parse_args()
public = Path(__file__).resolve().parents[1] / 'public'
ThreadingHTTPServer((args.bind, args.port), partial(Handler, directory=str(public))).serve_forever()
