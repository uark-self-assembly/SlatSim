import os
from http.server import HTTPServer, CGIHTTPRequestHandler

port = 8000

class NoCacheRequestHandler(CGIHTTPRequestHandler):
    # Tell the browser not to cache files, so edits to the page and its modules show up on reload
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

def main(port):
    # Make sure the server is created at current directory
    os.chdir('.')
    # Create server object listening the port specified
    server_object = HTTPServer(server_address=('', port), RequestHandlerClass=NoCacheRequestHandler)
    # Start the web server
    try:
        print(f'Web server starting on port {port}.')
        server_object.serve_forever()
    except KeyboardInterrupt:
        # Sometimes the interrupt takes a very long time to be processed...
        server_object.socket.close()
        print('Web server exiting.')

if __name__ == '__main__':
    main(port)

