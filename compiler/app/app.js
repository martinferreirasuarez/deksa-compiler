const form = document.querySelector('#build-form');
const seedInput = document.querySelector('#seed');
const randomButton = document.querySelector('#random');
const buildButton = document.querySelector('#build');
const status = document.querySelector('#status');
const details = document.querySelector('#details');
const download = document.querySelector('#download');

function randomSeed() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function show(message, detail = '', kind = '') {
  status.textContent = message;
  status.dataset.kind = kind;
  details.textContent = detail;
}

async function api(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Ocurrió un error.');
  return body;
}

async function checkEnvironment() {
  try {
    const { environment, busy } = await api('/api/status');
    if (!environment.ready) {
      show('Faltan herramientas para compilar.', 'El anfitrión debe completar la instalación antes de generar ROMs.', 'error');
      buildButton.disabled = true;
      return;
    }
    show(busy ? 'Hay una compilación en curso.' : 'Listo para compilar.', busy ? 'Probá de nuevo cuando termine.' : 'El resultado será un archivo .gba listo para jugar.');
  } catch (error) {
    show('No se pudo conectar al compilador.', error.message, 'error');
    buildButton.disabled = true;
  }
}

async function poll(id) {
  try {
    const job = await api(`/api/build/${id}`);
    if (job.state === 'complete') {
      show('Tu ROM está lista.', `Seed: ${job.seed} · SHA-256: ${job.sha256}`, 'success');
      download.href = job.download;
      download.hidden = false;
      buildButton.disabled = false;
      return;
    }
    if (job.state === 'failed') {
      show('La compilación no terminó.', job.error || 'Revisá el servidor e intentá otra vez.', 'error');
      buildButton.disabled = false;
      return;
    }
    show(job.phase, `Seed: ${job.seed}`);
    setTimeout(() => poll(id), 1200);
  } catch (error) {
    show('Se perdió la conexión.', error.message, 'error');
    buildButton.disabled = false;
  }
}

randomButton.addEventListener('click', () => {
  seedInput.value = randomSeed();
  seedInput.focus();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  download.hidden = true;
  buildButton.disabled = true;
  show('Preparando tu partida…');
  try {
    const { id } = await api('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: seedInput.value.trim() }),
    });
    poll(id);
  } catch (error) {
    show('No se pudo iniciar.', error.message, 'error');
    buildButton.disabled = false;
  }
});

seedInput.value = randomSeed();
checkEnvironment();
