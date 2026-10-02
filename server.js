import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const memoryJourneys = [];
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }) : null;

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS journeys (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS milestones (
      id UUID PRIMARY KEY,
      journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('start', 'waypoint', 'end')),
      created_at TIMESTAMPTZ NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      gps JSONB,
      readings JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);
}

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};
const readBody = async (req) => { let body = ''; for await (const chunk of req) body += chunk; return JSON.parse(body || '{}'); };

async function listJourneys() {
  if (!pool) return memoryJourneys;
  const { rows } = await pool.query(`
    SELECT j.id, j.name, j.created_at AS "createdAt",
      COALESCE(json_agg(json_build_object('id', m.id, 'label', m.label, 'type', m.type, 'createdAt', m.created_at, 'source', m.source, 'gps', m.gps, 'readings', m.readings) ORDER BY m.created_at) FILTER (WHERE m.id IS NOT NULL), '[]') AS milestones
    FROM journeys j LEFT JOIN milestones m ON m.journey_id = j.id
    GROUP BY j.id ORDER BY j.created_at DESC
  `);
  return rows;
}

async function findJourney(id) {
  if (!pool) return memoryJourneys.find((item) => item.id === id);
  const journeys = await listJourneys();
  return journeys.find((item) => item.id === id);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, persistent: Boolean(pool) });
    if (req.method === 'GET' && url.pathname === '/api/journeys') return json(res, 200, await listJourneys());

    if (req.method === 'POST' && url.pathname === '/api/journeys') {
      const input = await readBody(req); const name = String(input.name || '').trim();
      if (!name) return json(res, 400, { error: 'Journey name is required' });
      const journey = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), milestones: [] };
      if (pool) await pool.query('INSERT INTO journeys (id, name, created_at) VALUES ($1, $2, $3)', [journey.id, journey.name, journey.createdAt]);
      else memoryJourneys.unshift(journey);
      return json(res, 201, journey);
    }

    const milestoneMatch = url.pathname.match(/^\/api\/journeys\/([^/]+)\/milestones$/);
    if (milestoneMatch && req.method === 'POST') {
      const journey = await findJourney(milestoneMatch[1]);
      if (!journey) return json(res, 404, { error: 'Journey not found' });
      const input = await readBody(req); const label = String(input.label || '').trim(); const type = String(input.type || 'waypoint').trim().toLowerCase();
      if (!label) return json(res, 400, { error: 'Milestone label is required' });
      if (!['start', 'waypoint', 'end'].includes(type)) return json(res, 400, { error: 'Milestone type must be start, waypoint, or end' });
      const milestone = { id: crypto.randomUUID(), label, type, createdAt: new Date().toISOString(), source: input.source || 'manual', gps: input.gps || null, readings: input.readings || {} };
      if (pool) await pool.query('INSERT INTO milestones (id, journey_id, label, type, created_at, source, gps, readings) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [milestone.id, journey.id, milestone.label, milestone.type, milestone.createdAt, milestone.source, milestone.gps, milestone.readings]);
      else journey.milestones.push(milestone);
      return json(res, 201, milestone);
    }
    if (milestoneMatch && req.method === 'GET') {
      const journey = await findJourney(milestoneMatch[1]);
      if (!journey) return json(res, 404, { error: 'Journey not found' });
      return json(res, 200, journey.milestones || []);
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return createReadStream(join(root, 'public', 'index.html')).pipe(res); }
    if (req.method === 'GET' && url.pathname === '/app.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); return createReadStream(join(root, 'public', 'app.js')).pipe(res); }
    if (req.method === 'GET' && url.pathname === '/styles.css') { res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' }); return createReadStream(join(root, 'public', 'styles.css')).pipe(res); }
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'Internal server error' });
  }
});

await initDb();
server.listen(port, '0.0.0.0', () => console.log(`tmp-journeyrec listening on ${port} (${pool ? 'postgres' : 'memory'})`));
