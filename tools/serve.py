#!/usr/bin/env python3
"""Testserver für die Entwicklung.

Wie python3 -m http.server, aber mit "Access-Control-Allow-Origin: *".
Das braucht die Testhülle: dort liegt das Spiel in einem iframe mit
sandbox="allow-scripts", und ein solcher Rahmen hat einen undurchsichtigen
Ursprung. ES-Module werden mit CORS geholt, also lehnt der Browser sie ohne
diesen Kopf ab. GitHub Pages schickt ihn von sich aus.
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
