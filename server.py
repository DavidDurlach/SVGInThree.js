import http.server
import socketserver

PORT = 9999

class CrossOriginIsolatedHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()

with socketserver.TCPServer(("", PORT), CrossOriginIsolatedHandler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    print("Cross-Origin Isolation headers are enabled.")
    httpd.serve_forever()