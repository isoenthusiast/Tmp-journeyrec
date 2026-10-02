const list = document.querySelector('#journeys');
const form = document.querySelector('#journey-form');
const input = document.querySelector('#name');
const message = document.querySelector('#message');

function render(items) {
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = 'No journeys recorded yet.';
    list.append(empty);
    return;
  }
  for (const item of items) {
    const row = document.createElement('li');
    row.textContent = `${item.name} — ${new Date(item.createdAt).toLocaleString()}`;
    list.append(row);
  }
}

async function load() {
  const response = await fetch('/api/journeys');
  render(await response.json());
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  const response = await fetch('/api/journeys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: input.value })
  });
  const data = await response.json();
  if (!response.ok) {
    message.textContent = data.error || 'Unable to add journey';
    return;
  }
  input.value = '';
  message.textContent = 'Journey added.';
  await load();
});

load().catch(() => { message.textContent = 'Unable to load journeys.'; });
