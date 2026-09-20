#!/usr/bin/env python3
"""Development server.

Like python3 -m http.server, but with "Access-Control-Allow-Origin: *".
The test harness needs that header: there the game sits in an iframe with
sandbox="allow-scripts", and such a frame has an opaque origin. ES modules
are fetched with CORS, so without the header the browser refuses them.
GitHub Pages sends it by itself.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    ThreadingHTTPServer(('', port), Handler).serve_forever()
