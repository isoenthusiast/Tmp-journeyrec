const list = document.querySelector('#journeys');
const form = document.querySelector('#journey-form');
const input = document.querySelector('#name');
const message = document.querySelector('#message');
let pageGps = null;
let pageGpsPromise = Promise.resolve(null);
if ('geolocation' in navigator) {
  pageGpsPromise = new Promise((resolve) => navigator.geolocation.getCurrentPosition(
    (position) => { pageGps = { latitude: position.coords.latitude, longitude: position.coords.longitude }; resolve(pageGps); },
    () => resolve(null),
    { enableHighAccuracy: true, maximumAge: 120000, timeout: 10000 }
  ));
}

function addText(parent, text, className = '') {
  const element = document.createElement('span');
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

async function extractPhoto(file) {
  if (!file || !file.size) throw new Error('Choose an image document first.');
  if (file.type && !file.type.startsWith('image/')) throw new Error('The selected document is not a supported image.');
  if (!window.Tesseract?.recognize) throw new Error('OCR engine did not load. Check the connection and reload the page.');
  message.textContent = 'Loading dashboard OCR…';
  const [{ GPSLatitude, GPSLongitude, GPSLatitudeRef, GPSLongitudeRef }, ocr] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.mjs').then((exifr) => exifr.gps(file).catch(() => ({}))),
    window.Tesseract.recognize(file, 'eng', { logger: (info) => { if (info.status === 'recognizing text') message.textContent = `Reading dashboard: ${Math.round(info.progress * 100)}%`; } })
  ]);
  const text = ocr.data.text.replace(/\s+/g, ' ');
  const number = (pattern, fallback = null) => text.match(pattern)?.[1] || (fallback ? text.match(fallback)?.[1] || '' : '');
  const signed = (value, ref) => ref && /[SW]/i.test(ref) ? -Math.abs(value) : value;
  const gps = GPSLatitude && GPSLongitude ? { latitude: signed(GPSLatitude, GPSLatitudeRef), longitude: signed(GPSLongitude, GPSLongitudeRef) } : null;
  return {
    gps,
    readings: {
      odometerKm: number(/(?:总里程|total\s*mileage|odometer)\s*([0-9]{3,})/i, /\b([0-9]{5,6})\b/),
      rangeKm: number(/(?:range|续航)\s*([0-9]{2,})\s*km/i, /\b([0-9]{2,3})\s*km\b/i),
      batteryPercent: number(/(?:battery|电量)\s*([0-9]{1,3})\s*%/i, /\b([0-9]{1,3})\s*%/),
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
    milestoneForm.innerHTML = `<input name="label" required placeholder="Milestone name"><select name="type" aria-label="Milestone type"><option value="start">Start</option><option value="waypoint" selected>Waypoint</option><option value="end">End</option></select><input name="photo" type="file" aria-label="Dashboard photo document"><button type="button" class="extract-photo">Read photo</button><button type="submit">Save milestone</button><div class="reading-fields"><label>Odometer km <input name="odometerKm" inputmode="decimal"></label><label>Battery % <input name="batteryPercent" inputmode="decimal"></label><label>Range km <input name="rangeKm" inputmode="decimal"></label><label>Speed km/h <input name="speedKmh" inputmode="decimal"></label><label>Temperature °C <input name="temperatureC" inputmode="decimal"></label><label>Latitude <input name="latitude" inputmode="decimal"></label><label>Longitude <input name="longitude" inputmode="decimal"></label></div><p class="photo-status muted"></p>`;
    const photoStatus = milestoneForm.querySelector('.photo-status');
    const photoInput = milestoneForm.querySelector('input[type=file]');
    const setGpsFields = (gps) => { if (gps) { milestoneForm.elements.latitude.value = gps.latitude; milestoneForm.elements.longitude.value = gps.longitude; } };
    pageGpsPromise.then((gps) => { if (gps && !milestoneForm.dataset.gpsSource) { setGpsFields(gps); milestoneForm.dataset.gpsSource = 'device-geolocation'; photoStatus.textContent = 'Current device GPS loaded. Photo EXIF GPS will take priority.'; } });
    const extractButton = milestoneForm.querySelector('.extract-photo');
    extractButton.addEventListener('click', async () => {
      const photo = photoInput.files[0];
      if (!photo?.size) { photoStatus.textContent = 'Choose a dashboard photo first.'; return; }
      try {
        extractButton.disabled = true; photoStatus.textContent = 'Reading dashboard and EXIF GPS…';
        const extracted = await extractPhoto(photo);
        for (const key of ['odometerKm', 'batteryPercent', 'rangeKm', 'speedKmh', 'temperatureC']) milestoneForm.elements[key].value = extracted.readings[key];
        setGpsFields(extracted.gps || pageGps);
        milestoneForm.dataset.gps = JSON.stringify(extracted.gps || pageGps);
        milestoneForm.dataset.gpsSource = extracted.gps ? 'photo-exif' : (pageGps ? 'device-geolocation' : '');
        milestoneForm.dataset.source = 'dashboard-photo';
        photoStatus.textContent = extracted.gps ? `GPS found in photo metadata: ${extracted.gps.latitude}, ${extracted.gps.longitude}. Review readings, then save.` : (pageGps ? 'No photo GPS metadata; using current device GPS. Review fields, then save.' : 'No GPS metadata or device GPS found. Review fields, then save.');
      } catch (error) { photoStatus.textContent = `Photo extraction failed: ${error.message}`; } finally { extractButton.disabled = false; }
    });
    photoInput.addEventListener('change', () => { milestoneForm.dataset.gps = ''; milestoneForm.dataset.source = ''; photoStatus.textContent = 'Photo selected. Press Read photo.'; });
    milestoneForm.addEventListener('submit', async (event) => {
      event.preventDefault(); const data = new FormData(milestoneForm);
      const readings = Object.fromEntries(['odometerKm', 'batteryPercent', 'rangeKm', 'speedKmh', 'temperatureC'].map((key) => [key, data.get(key)]).filter(([, value]) => value));
      const latitude = Number(data.get('latitude')); const longitude = Number(data.get('longitude'));
      const gps = Number.isFinite(latitude) && Number.isFinite(longitude) && data.get('latitude') !== '' && data.get('longitude') !== '' ? { latitude, longitude } : null;
      const response = await fetch(`/api/journeys/${item.id}/milestones`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: data.get('label'), type: data.get('type'), source: milestoneForm.dataset.gpsSource || milestoneForm.dataset.source || 'manual', gps, readings }) });
      const result = await response.json(); if (!response.ok) { message.textContent = result.error || 'Unable to add milestone'; return; }
      message.textContent = gps ? `Milestone added with GPS (${milestoneForm.dataset.gpsSource || 'manual'}).` : 'Milestone added; no GPS metadata or device GPS was available.'; await load();
    });
    card.append(milestoneForm); list.append(card);
  }
}

async function load() { const response = await fetch('/api/journeys'); render(await response.json()); }
form.addEventListener('submit', async (event) => { event.preventDefault(); const response = await fetch('/api/journeys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: input.value }) }); const data = await response.json(); if (!response.ok) { message.textContent = data.error || 'Unable to add journey'; return; } input.value = ''; message.textContent = 'Journey added.'; await load(); });
load().catch(() => { message.textContent = 'Unable to load journeys.'; });
