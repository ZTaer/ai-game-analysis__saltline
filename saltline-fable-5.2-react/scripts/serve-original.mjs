import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Read-only baseline: no copying or modifying the original project.
const source = fileURLToPath(new URL('../../saltline-fable-5.2/index.html', import.meta.url));
createServer(async (request, response) => {
  if (new URL(request.url, 'http://localhost').pathname === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  try {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(await readFile(source));
  } catch (error) {
    response.writeHead(500).end(`Original project unavailable: ${error.message}`);
  }
}).listen(8731, '127.0.0.1', () => console.log('Original: http://127.0.0.1:8731'));
