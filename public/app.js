const list = document.querySelector('#journeys');
const form = document.querySelector('#journey-form');
const input = document.querySelector('#name');
const message = document.querySelector('#message');

function addText(parent, text, className = '') {
  const element = document.createElement('span');
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function render(items) {
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No journeys recorded yet.';
    list.append(empty);
    return;
  }
  for (const item of items) {
    const card = document.createElement('article');
    const heading = document.createElement('h3');
    addText(heading, item.name);
    addText(heading, `Added ${new Date(item.createdAt).toLocaleString()}`, 'muted timestamp');
    card.append(heading);

    const milestones = document.createElement('ol');
    milestones.className = 'milestones';
    for (const milestone of item.milestones || []) {
      const row = document.createElement('li');
      addText(row, milestone.label);
      addText(row, milestone.type, 'badge');
      milestones.append(row);
    }
    if (!item.milestones?.length) {
      const empty = document.createElement('li');
      empty.className = 'muted';
      empty.textContent = 'No milestones yet.';
      milestones.append(empty);
    }
    card.append(milestones);

    const milestoneForm = document.createElement('form');
    milestoneForm.className = 'milestone-form';
    milestoneForm.innerHTML = `<input name="label" required placeholder="Milestone name">
      <select name="type" aria-label="Milestone type">
        <option value="start">Start</option>
        <option value="waypoint" selected>Waypoint</option>
        <option value="end">End</option>
      </select>
      <button>Add milestone</button>`;
    milestoneForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(milestoneForm);
      const response = await fetch(`/api/journeys/${item.id}/milestones`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: data.get('label'), type: data.get('type') })
      });
      const result = await response.json();
      if (!response.ok) {
        message.textContent = result.error || 'Unable to add milestone';
        return;
      }
      message.textContent = 'Milestone added.';
      await load();
    });
    card.append(milestoneForm);
    list.append(card);
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
