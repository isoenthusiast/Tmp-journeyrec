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

function parseExifDate(value) {
  if (value instanceof Date) return value;
  const match = String(value).match(/^(\d{4})[:\/-](\d{2})[:\/-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0));
}

async function extractPhoto(file) {
  if (!file || !file.size) throw new Error('Choose an image document first.');
  if (file.type && !file.type.startsWith('image/')) throw new Error('The selected document is not a supported image.');
  if (!window.Tesseract?.recognize) throw new Error('OCR engine did not load. Check the connection and reload the page.');
  message.textContent = 'Loading dashboard OCR…';
  const [exifr, ocr] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.mjs'),
    window.Tesseract.recognize(file, 'eng', { logger: (info) => { if (info.status === 'recognizing text') message.textContent = `Reading dashboard: ${Math.round(info.progress * 100)}%`; } })
  ]);
  const metadata = await exifr.parse(file, { tiff: true, exif: true, gps: true }).catch(() => ({}));
  const { GPSLatitude, GPSLongitude, GPSLatitudeRef, GPSLongitudeRef } = metadata;
  const text = ocr.data.text.replace(/\s+/g, ' ');
  const number = (pattern, fallback = null) => text.match(pattern)?.[1] || (fallback ? text.match(fallback)?.[1] || '' : '');
  const signed = (value, ref) => ref && /[SW]/i.test(ref) ? -Math.abs(value) : value;
  const gps = GPSLatitude && GPSLongitude ? { latitude: signed(GPSLatitude, GPSLatitudeRef), longitude: signed(GPSLongitude, GPSLongitudeRef) } : null;
  const exifDate = metadata.DateTimeOriginal || metadata.CreateDate || metadata.ModifyDate || null;
  const capturedAt = exifDate ? parseExifDate(exifDate) : null;
  return {
    gps,
    capturedAt: capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt.toISOString() : null,
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
      if (milestone.capturedAt) addText(row, `Dashboard time: ${new Date(milestone.capturedAt).toLocaleString()}`, 'metadata');
      if (milestone.gps) addText(row, `GPS ${milestone.gps.latitude}, ${milestone.gps.longitude}`, 'metadata');
      const readings = Object.entries(milestone.readings || {}).filter(([key]) => key !== 'rawText' && milestone.readings[key]);
      if (readings.length) addText(row, readings.map(([key, value]) => `${key}: ${value}`).join(' · '), 'metadata');
      milestones.append(row);
    }
    if (!item.milestones?.length) { const empty = document.createElement('li'); empty.className = 'muted'; empty.textContent = 'No milestones yet.'; milestones.append(empty); }
    card.append(milestones);

    const milestoneForm = document.createElement('form'); milestoneForm.className = 'milestone-form';
    milestoneForm.innerHTML = `<div class="field field-wide"><label for="label-${item.id}">Milestone name</label><input id="label-${item.id}" name="label" required placeholder="e.g. Left home, charging stop"></div><div class="field"><label for="type-${item.id}">Milestone type</label><select id="type-${item.id}" name="type"><option value="start">Start</option><option value="waypoint" selected>Waypoint</option><option value="end">End</option></select></div><div class="field"><label for="capturedAt-${item.id}">Dashboard timestamp (EXIF)</label><input id="capturedAt-${item.id}" name="capturedAt" type="datetime-local"><small class="muted">Read from dashboard; edit if needed.</small></div><div class="field field-wide"><label for="photo-${item.id}">Dashboard photo <span class="muted">(optional)</span></label><input id="photo-${item.id}" name="photo" type="file" aria-label="Dashboard photo document"><small class="muted">Choose an image document, then read it to fill the fields.</small></div><div class="actions"><button type="button" class="extract-photo secondary">Read dashboard photo</button><button type="submit">Save milestone</button></div><div class="reading-fields"><h4>Journey readings <span class="muted">Review or enter manually</span></h4><label>Odometer (km)<input name="odometerKm" inputmode="decimal"></label><label>Battery (%)<input name="batteryPercent" inputmode="decimal"></label><label>Range (km)<input name="rangeKm" inputmode="decimal"></label><label>Speed (km/h)<input name="speedKmh" inputmode="decimal"></label><label>Temperature (°C)<input name="temperatureC" inputmode="decimal"></label><label>Latitude<input name="latitude" inputmode="decimal"></label><label>Longitude<input name="longitude" inputmode="decimal"></label></div><p class="photo-status muted" role="status"></p>`;
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
        if (extracted.capturedAt) milestoneForm.elements.capturedAt.value = extracted.capturedAt.slice(0, 16);
        milestoneForm.dataset.gps = JSON.stringify(extracted.gps || pageGps);
        milestoneForm.dataset.gpsSource = extracted.gps ? 'photo-exif' : (pageGps ? 'device-geolocation' : '');
        milestoneForm.dataset.source = 'dashboard-photo';
        photoStatus.textContent = `${extracted.capturedAt ? 'Dashboard timestamp read from EXIF. ' : 'No EXIF dashboard timestamp found. '} ${extracted.gps ? `GPS found in photo metadata: ${extracted.gps.latitude}, ${extracted.gps.longitude}.` : (pageGps ? 'No photo GPS metadata; using current device GPS.' : 'No GPS metadata or device GPS found.')} Review readings, then save.`;
      } catch (error) { photoStatus.textContent = `Photo extraction failed: ${error.message}`; } finally { extractButton.disabled = false; }
    });
    photoInput.addEventListener('change', () => { milestoneForm.dataset.gps = ''; milestoneForm.dataset.source = ''; photoStatus.textContent = 'Photo selected. Press Read photo.'; });
    milestoneForm.addEventListener('submit', async (event) => {
      event.preventDefault(); const data = new FormData(milestoneForm);
      const readings = Object.fromEntries(['odometerKm', 'batteryPercent', 'rangeKm', 'speedKmh', 'temperatureC'].map((key) => [key, data.get(key)]).filter(([, value]) => value));
      const latitude = Number(data.get('latitude')); const longitude = Number(data.get('longitude'));
      const gps = Number.isFinite(latitude) && Number.isFinite(longitude) && data.get('latitude') !== '' && data.get('longitude') !== '' ? { latitude, longitude } : null;
      const capturedAt = data.get('capturedAt') ? new Date(data.get('capturedAt')).toISOString() : null;
      const response = await fetch(`/api/journeys/${item.id}/milestones`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: data.get('label'), type: data.get('type'), capturedAt, source: milestoneForm.dataset.gpsSource || milestoneForm.dataset.source || 'manual', gps, readings }) });
      const result = await response.json(); if (!response.ok) { message.textContent = result.error || 'Unable to add milestone'; return; }
      message.textContent = gps ? `Milestone added with GPS (${milestoneForm.dataset.gpsSource || 'manual'}).` : 'Milestone added; no GPS metadata or device GPS was available.'; await load();
    });
    card.append(milestoneForm); list.append(card);
  }
}

async function load() { const response = await fetch('/api/journeys'); render(await response.json()); }
form.addEventListener('submit', async (event) => { event.preventDefault(); const response = await fetch('/api/journeys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: input.value }) }); const data = await response.json(); if (!response.ok) { message.textContent = data.error || 'Unable to add journey'; return; } input.value = ''; message.textContent = 'Journey added.'; await load(); });
load().catch(() => { message.textContent = 'Unable to load journeys.'; });
