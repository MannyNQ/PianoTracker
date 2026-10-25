// In-page helpers for driving PianoTracker Pro from the in-app browser.
// Served by the verification Vite config at /__verify/page-helpers.js. Load with:
//   const h = await import('/__verify/page-helpers.js');
// Every helper drives the real UI: real file inputs, real buttons, real video.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Put a fixture into a real <input type=file> and fire the change React listens to.
 *  `scope` is the element that contains the input (an upload drop zone, the Score tab). */
export async function putFixture(scope, fixture, filename = fixture) {
  const input = scope.querySelector('input[type=file]');
  if (!input) throw new Error('no file input in scope');
  const res = await fetch(`/__verify/fixtures/${fixture}`);
  if (!res.ok) throw new Error(`fixture ${fixture}: ${res.status} (run verify.sh fixtures)`);
  const dt = new DataTransfer();
  dt.items.add(new File([await res.blob()], filename));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return `${filename}: ${dt.files[0].size} bytes`;
}

/** The upload drop zone (role=button) whose title is e.g. 'Performance video' or 'Score'. */
export const dropZone = (title) =>
  [...document.querySelectorAll('main [role=button]')].find((z) => z.textContent.includes(title));

/** Click a button by its exact accessible text or aria-label. */
export function clickButton(label) {
  const b = [...document.querySelectorAll('button')].find(
    (x) => x.getAttribute('aria-label') === label || x.textContent.trim() === label,
  );
  if (!b) throw new Error(`no button "${label}"`);
  if (b.disabled) throw new Error(`button "${label}" is disabled`);
  b.click();
}

/** Open a studio tab: 'Summary' | 'Keyboard' | 'Score'. */
export function openTab(name) {
  const t = [...document.querySelectorAll('[role=tab]')].find((x) => x.textContent.trim() === name);
  if (!t) throw new Error(`no tab ${name} (is a session open?)`);
  t.click();
}

/** Wait until the studio session view is showing (job finished), or throw on an alert. */
export async function waitForSession(timeoutMs = 600000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (document.querySelector('[role=tab]') && document.querySelector('video')) return location.hash;
    const alert = document.querySelector('[role=alert]');
    if (alert) throw new Error(`app error: ${alert.textContent}`);
    await sleep(1000);
  }
  throw new Error('session did not open in time');
}

const overlay = () => document.querySelector('video')?.parentElement.querySelector('canvas');

/** Seek the real <video> and wait until the overlay canvas and HUD clock catch up.
 *  A hidden browser pane throttles requestAnimationFrame to ~1 fps, so this polls. */
export async function seekAndSettle(seconds, timeoutMs = 15000) {
  const v = document.querySelector('video');
  v.pause();
  await new Promise((r) => {
    v.addEventListener('seeked', r, { once: true });
    v.currentTime = seconds;
  });
  const want = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')} /`;
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const c = overlay();
    const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i]) painted++;
    if (painted > 0 && document.body.innerText.includes(want)) return { painted, clock: want };
    await sleep(500);
  }
  throw new Error(`overlay/HUD did not settle at ${seconds}s`);
}

/** Write a file into the current evidence dir (set by `verify.sh evidence <label>`). */
export async function saveEvidence(name, body) {
  const res = await fetch(`/__verify/evidence/${encodeURIComponent(name)}`, { method: 'POST', body });
  if (!res.ok) throw new Error(await res.text());
  return res.text();
}

/** Save the current video frame with the overlay composited on top, as PNG. */
export async function captureFrame(name) {
  const v = document.querySelector('video');
  const o = overlay();
  const c = document.createElement('canvas');
  c.width = o.width;
  c.height = o.height;
  const g = c.getContext('2d');
  g.drawImage(v, 0, 0, c.width, c.height);
  g.drawImage(o, 0, 0);
  return saveEvidence(name, c.toDataURL('image/png'));
}

/** Save the URL, tab state and visible text of the main area. */
export async function captureText(name) {
  const tabs = [...document.querySelectorAll('[role=tab]')].map(
    (t) => `${t.textContent.trim()}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}`,
  );
  const text = `${location.hash}\ntabs: ${tabs.join(' | ')}\n\n${document.querySelector('main').innerText}`;
  await saveEvidence(name, text);
  return text;
}
