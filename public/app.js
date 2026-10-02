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

async function extractPhoto(file) {
  const [{ GPSLatitude, GPSLongitude, GPSLatitudeRef, GPSLongitudeRef }, ocr] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.mjs').then((exifr) => exifr.gps(file).catch(() => ({}))),
    window.Tesseract.recognize(file, 'eng', { logger: (info) => { if (info.status === 'recognizing text') message.textContent = `Reading dashboard: ${Math.round(info.progress * 100)}%`; } })
  ]);
  const text = ocr.data.text.replace(/\s+/g, ' ');
  const number = (pattern) => text.match(pattern)?.[1] || '';
  const signed = (value, ref) => ref && /[SW]/i.test(ref) ? -Math.abs(value) : value;
  const gps = GPSLatitude && GPSLongitude ? { latitude: signed(GPSLatitude, GPSLatitudeRef), longitude: signed(GPSLongitude, GPSLongitudeRef) } : null;
  return {
    gps,
    readings: {
      odometerKm: number(/(?:总里程|total\s*mileage|odometer)\s*([0-9]{3,})/i),
      rangeKm: number(/(?:range|续航)\s*([0-9]{2,})\s*km/i),
      batteryPercent: number(/(?:battery|电量)\s*([0-9]{1,3})\s*%/i),
      speedKmh: number(/([0-9]{1,3})\s*km\/h/i),
      temperatureC: number(/([0-9]{1,2})\s*°?c/i),
      rawText: text
    }
  };
}

function render(items) {
  list.replaceChildren();
  if (!items.length) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'No journeys recorded yet.'; list.append(empty); return; }
  for (const item of items) {
    const card = document.createElement('article');
    const heading = document.createElement('h3');
    addText(heading, item.name); addText(heading, `Added ${new Date(item.createdAt).toLocaleString()}`, 'muted timestamp'); card.append(heading);
    const milestones = document.createElement('ol'); milestones.className = 'milestones';
    for (const milestone of item.milestones || []) {
      const row = document.createElement('li'); addText(row, milestone.label); addText(row, milestone.type, 'badge');
      if (milestone.gps) addText(row, `GPS ${milestone.gps.latitude}, ${milestone.gps.longitude}`, 'metadata');
      const readings = Object.entries(milestone.readings || {}).filter(([key]) => key !== 'rawText' && milestone.readings[key]);
      if (readings.length) addText(row, readings.map(([key, value]) => `${key}: ${value}`).join(' · '), 'metadata');
      milestones.append(row);
    }
    if (!item.milestones?.length) { const empty = document.createElement('li'); empty.className = 'muted'; empty.textContent = 'No milestones yet.'; milestones.append(empty); }
    card.append(milestones);

    const milestoneForm = document.createElement('form'); milestoneForm.className = 'milestone-form';
    milestoneForm.innerHTML = `<input name="label" required placeholder="Milestone name"><select name="type" aria-label="Milestone type"><option value="start">Start</option><option value="waypoint" selected>Waypoint</option><option value="end">End</option></select><input name="photo" type="file" accept="image/*" aria-label="Dashboard photo"><button>Add milestone</button><p class="photo-status muted"></p>`;
    const photoStatus = milestoneForm.querySelector('.photo-status');
    milestoneForm.querySelector('input[type=file]').addEventListener('change', () => { photoStatus.textContent = 'Photo selected; dashboard and EXIF GPS will be read when saved.'; });
    milestoneForm.addEventListener('submit', async (event) => {
      event.preventDefault(); const data = new FormData(milestoneForm); let extracted = { gps: null, readings: {} };
      const photo = data.get('photo');
      if (photo?.size) { try { extracted = await extractPhoto(photo); } catch (error) { message.textContent = `Photo extraction failed: ${error.message}`; return; } }
      const response = await fetch(`/api/journeys/${item.id}/milestones`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: data.get('label'), type: data.get('type'), source: photo?.size ? 'dashboard-photo' : 'manual', ...extracted }) });
      const result = await response.json(); if (!response.ok) { message.textContent = result.error || 'Unable to add milestone'; return; }
      message.textContent = extracted.gps ? 'Milestone added with GPS from photo metadata.' : 'Milestone added; no GPS metadata was found.'; await load();
    });
    card.append(milestoneForm); list.append(card);
  }
}

async function load() { const response = await fetch('/api/journeys'); render(await response.json()); }
form.addEventListener('submit', async (event) => { event.preventDefault(); const response = await fetch('/api/journeys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: input.value }) }); const data = await response.json(); if (!response.ok) { message.textContent = data.error || 'Unable to add journey'; return; } input.value = ''; message.textContent = 'Journey added.'; await load(); });
load().catch(() => { message.textContent = 'Unable to load journeys.'; });
