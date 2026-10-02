import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const journeys = [];

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/journeys') {
    return json(res, 200, journeys);
  }

  if (req.method === 'POST' && url.pathname === '/api/journeys') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const input = JSON.parse(body || '{}');
      const name = String(input.name || '').trim();
      if (!name) return json(res, 400, { error: 'Journey name is required' });
      const journey = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
      journeys.unshift(journey);
      return json(res, 201, journey);
    } catch {
      return json(res, 400, { error: 'Request body must be valid JSON' });
    }
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return createReadStream(join(root, 'public', 'index.html')).pipe(res);
  }

  if (req.method === 'GET' && url.pathname === '/app.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    return createReadStream(join(root, 'public', 'app.js')).pipe(res);
  }

  if (req.method === 'GET' && url.pathname === '/styles.css') {
    res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
    return createReadStream(join(root, 'public', 'styles.css')).pipe(res);
  }

  return json(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`tmp-journeyrec listening on ${port}`);
});
