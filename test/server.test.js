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
  assert.deepEqual(await response.json(), { ok: true });
});

test('journeys can be created and listed', async () => {
  const created = await fetch(`http://127.0.0.1:${port}/api/journeys`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test trip' })
  });
  assert.equal(created.status, 201);
  const list = await fetch(`http://127.0.0.1:${port}/api/journeys`);
  assert.equal((await list.json())[0].name, 'Test trip');
});

test.after(() => child.kill());
