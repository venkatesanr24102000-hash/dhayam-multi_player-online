"""Tiny local web server for Dhayam.
Run from anywhere:  python python/server.py [port]
Then open http://localhost:8000 (the LAN address is printed so a phone on the same Wi-Fi can open it too)."""
import http.server, socketserver, socket, sys, os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.webmanifest': 'application/manifest+json', '.js': 'text/javascript', '.wav': 'audio/wav', '.mp3': 'audio/mpeg'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1)); return s.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        s.close()

if __name__ == '__main__':
    with socketserver.ThreadingTCPServer(('', PORT), Handler) as httpd:
        print(f'Dhayam running:\n  this computer : http://localhost:{PORT}\n  same Wi-Fi    : http://{lan_ip()}:{PORT}\nPress Ctrl+C to stop.')
        try: httpd.serve_forever()
        except KeyboardInterrupt: print('\nStopped.')
