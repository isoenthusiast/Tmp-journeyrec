import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 43127;
const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port) } });
await new Promise((resolve, reject) => {
  child.stdout.on('data', (data) => data.toString().includes('listening') && resolve());
  child.on('error', reject);
});

test('health endpoint responds', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, persistent: false });
});

test('journeys can be created and listed with milestones', async () => {
  const created = await fetch(`http://127.0.0.1:${port}/api/journeys`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test trip' })
  });
  assert.equal(created.status, 201);
  const journey = await created.json();
  assert.deepEqual(journey.milestones, []);

  const milestone = await fetch(`http://127.0.0.1:${port}/api/journeys/${journey.id}/milestones`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label: 'Home', type: 'start', capturedAt: '2026-10-02T08:30:00.000Z' })
  });
  assert.equal(milestone.status, 201);
  const milestoneData = await milestone.json();
  assert.equal(milestoneData.type, 'start');
  assert.equal(milestoneData.capturedAt, '2026-10-02T08:30:00.000Z');

  const list = await fetch(`http://127.0.0.1:${port}/api/journeys`);
  const listed = await list.json();
  assert.equal(listed[0].name, 'Test trip');
  assert.equal(listed[0].milestones[0].label, 'Home');
});

test('milestone validation rejects invalid types', async () => {
  const created = await fetch(`http://127.0.0.1:${port}/api/journeys`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Validation trip' })
  });
  const journey = await created.json();
  const response = await fetch(`http://127.0.0.1:${port}/api/journeys/${journey.id}/milestones`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label: 'Unknown', type: 'invalid' })
  });
  assert.equal(response.status, 400);
});

test.after(() => child.kill());
