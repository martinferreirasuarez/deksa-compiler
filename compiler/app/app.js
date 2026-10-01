import { BASE_ROM } from './rom-base.mjs';

const form = document.querySelector('#build-form');
const romInput = document.querySelector('#original-rom');
const romStatus = document.querySelector('#rom-status');
const seedInput = document.querySelector('#seed');
const randomButton = document.querySelector('#random');
const buildButton = document.querySelector('#build');
const status = document.querySelector('#status');
const details = document.querySelector('#details');
const download = document.querySelector('#download');
const retryButton = document.querySelector('#retry');
const versionLabel = document.querySelector('#game-version');
const reportLink = document.querySelector('#report-problem');
let environmentReady = false;
let validatedFile = null;
let working = false;
let validationId = 0;
let downloadUrl = null;
let currentJob = null;
let pollTimer = null;
let pollSerial = 0;
const STORAGE_KEY = 'deksa-pending-build';
function remember(job) {
  currentJob = job;
  try {
    if (job) localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: job.id, seed: job.seed, version: job.version }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* Building still works when browser storage is unavailable. */ }
}
function updateReport(seed = seedInput.value) {
  const version = versionLabel.textContent;
  const body = `Game version: ${version}\nSeed: ${seed}\nEmulator and version:\nDevice/browser:\n\nWhat happened?\n\nWhat did you expect?\n\nSteps to reproduce:\n`;
  reportLink.href = 'https://github.com/martinferreirasuarez/firereddeksa/issues/new?' + new URLSearchParams({ body });
}

function randomSeed() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function show(message, detail = '', kind = '') {
  status.textContent = message;
  status.dataset.kind = kind;
  details.textContent = detail;
}
function controls() {
  buildButton.disabled = working || !environmentReady || !validatedFile;
  romInput.disabled = working && !!validatedFile;
  seedInput.disabled = randomButton.disabled = working;
}
function clearDownload() {
  download.hidden = true;
  download.removeAttribute('href');
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
}
async function api(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new TypeError('Connection unavailable');
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || 'Something went wrong.'), { status: response.status });
  return body;
}
function processRom(payload, transfer = []) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/patch-worker.js');
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('File processing took too long. Select your original ROM and try again.')); }, 60000);
    worker.onmessage = ({ data }) => {
      clearTimeout(timer);
      worker.terminate();
      if (data.error) reject(new Error(data.error)); else resolve(data);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error('Unable to prepare the file in this browser. Use a current version of Safari, Chrome or Firefox.'));
    };
    worker.postMessage({ ...payload, baseRom: BASE_ROM }, transfer);
  });
}

romInput.addEventListener('change', async () => {
  pollSerial++; clearTimeout(pollTimer);
  const attempt = ++validationId;
  validatedFile = null;
  clearDownload();
  controls();
  romStatus.dataset.kind = '';
  const file = romInput.files[0];
  if (!file) { romStatus.textContent = 'Select the original .gba file.'; return; }
  romStatus.textContent = 'Checking FireRed…';
  try {
    await processRom({ action: 'validate', file });
    if (attempt !== validationId) return;
    validatedFile = file;
    romStatus.textContent = 'Original FireRed verified. The file stays on your device.';
    romStatus.dataset.kind = 'success';
  } catch (error) {
    if (attempt !== validationId) return;
    romStatus.textContent = error.message;
    romStatus.dataset.kind = 'error';
  }
  controls();
  if (currentJob?.id) { clearTimeout(pollTimer); working = true; controls(); poll(currentJob.id); }
});

async function checkEnvironment() {
  try {
    const { environment, busy, waiting, version } = await api('/api/status');
    environmentReady = environment.ready;
    versionLabel.textContent = version;
    updateReport();
    retryButton.hidden = environmentReady;
    show(environmentReady ? (busy ? 'Another game is being built.' : 'Ready to build your game.') : 'The server is unavailable.',
      environmentReady ? (busy ? `Your request can join the waiting list${waiting ? ` (${waiting} waiting)` : ''}.` : 'Select your original FireRed ROM and choose a seed.') : 'Try again later.', environmentReady ? '' : 'error');
  } catch (error) { environmentReady = false; retryButton.hidden = false; show('Unable to connect.', 'Check your connection and retry.', 'error'); }
  controls();
}

async function finish(job, file) {
  show('Preparing the game on your device…', `Seed: ${job.seed}`);
  const response = await fetch(job.download, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw Object.assign(new Error('Unable to download the game data.'), { status: response.status });
  const patch = await response.arrayBuffer();
  const { bytes } = await processRom({ action: 'apply', file, patch, sha256: job.sha256, patchSha256: job.patchSha256 }, [patch]);
  downloadUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  download.href = downloadUrl;
  download.download = job.romName;
  download.hidden = false;
  show('Your game is ready.', `Seed: ${job.seed} · Download it and open it in your emulator.`, 'success');
  updateReport(job.seed);
}
async function poll(id, serial = pollSerial) {
  if (currentJob?.id !== id || serial !== pollSerial) return;
  try {
    const job = await api(`/api/build/${id}`);
    if (currentJob?.id !== id || serial !== pollSerial) return;
    if (job.state === 'complete') {
      if (!validatedFile) {
        show('Your game is ready to download.', 'Select your original FireRed ROM again to prepare the download.', 'success');
        working = false; controls(); return;
      }
      await finish(job, validatedFile);
      working = false; controls(); return;
    }
    if (job.state === 'failed') {
      remember(null); working = false; controls();
      show('Unable to prepare the game.', job.error, 'error'); return;
    }
    show(job.state === 'queued' ? `Waiting · position ${job.position}` : 'Building your game…',
      `Seed: ${job.seed} · You can return to this page if your connection drops.`);
    pollTimer = setTimeout(() => poll(id, serial), 2000);
  } catch (error) {
    if (currentJob?.id !== id || serial !== pollSerial) return;
    if (error.status === 404) {
      remember(null); working = false; controls();
      show('This request has expired.', 'Your seed is still here. Build the game again.', 'error'); return;
    }
    if (!error.status && !['TypeError', 'TimeoutError', 'AbortError'].includes(error.name)) {
      working = false; controls();
      show('Unable to prepare the game.', error.message, 'error'); return;
    }
    show('Reconnecting…', 'Your request is saved. The page will retry automatically.');
    pollTimer = setTimeout(() => poll(id, serial), 4000);
  }
}
randomButton.addEventListener('click', () => { remember(null); seedInput.value = randomSeed(); seedInput.focus(); updateReport(); clearDownload(); });
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (working || !environmentReady || !validatedFile || romInput.files[0] !== validatedFile) return;
  working = true; clearDownload(); controls();
  pollSerial++; clearTimeout(pollTimer);
  remember({ id: null, seed: seedInput.value.trim(), version: versionLabel.textContent });
  show('Starting the build…');
  try {
    const job = await api('/api/build', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: seedInput.value.trim() }),
    });
    remember(job); updateReport(job.seed); poll(job.id);
  } catch (error) {
    show('Unable to start.', error.message, 'error');
    working = false; controls();
    if (!error.status) { retryButton.hidden = false; }
  }
});
window.addEventListener('pagehide', clearDownload);
seedInput.value = randomSeed();
seedInput.addEventListener('input', () => { remember(null); clearDownload(); updateReport(); });
retryButton.addEventListener('click', () => { checkEnvironment(); });
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (saved && typeof saved.seed === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(saved.seed)) {
    seedInput.value = saved.seed;
    if (/^[0-9a-f-]{36}$/.test(saved.id)) { currentJob = saved; working = true; }
  }
} catch { /* No saved request. */ }
checkEnvironment().then(() => { if (currentJob) { working = true; controls(); poll(currentJob.id); } });
