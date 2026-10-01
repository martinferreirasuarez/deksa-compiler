/* global BinFile, BPS */
importScripts('/vendor/rom-patcher-js/HashCalculator.js', '/vendor/rom-patcher-js/BinFile.js', '/vendor/rom-patcher-js/RomPatcher.format.bps.js');

async function digest(algorithm, buffer) {
  const hash = await crypto.subtle.digest(algorithm, buffer);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

self.onmessage = async ({ data }) => {
  try {
    const { file, baseRom, action } = data;
    if (!file || file.size !== baseRom.bytes) throw new Error('Select the original English FireRed 1.0 ROM (16 MiB), not a ZIP or a modified ROM.');
    const source = await file.arrayBuffer();
    if (await digest('SHA-1', source) !== baseRom.sha1) throw new Error('This is not the original English FireRed 1.0 ROM. It may be a different revision, language or a modified ROM.');
    if (action === 'validate') { self.postMessage({ valid: true }); return; }
    if (action !== 'apply') throw new Error('Unknown operation.');
    if (await digest('SHA-256', data.patch) !== data.patchSha256) throw new Error('The patch is incomplete or damaged. Please try again.');
    const patchFile = new BinFile(data.patch);
    if (patchFile.readString(4) !== 'BPS1') throw new Error('The server did not return a valid BPS patch.');
    const patch = BPS.fromFile(patchFile);
    if (patch.sourceSize !== baseRom.bytes || patch.targetSize !== baseRom.bytes) throw new Error('Unexpected ROM size in the patch.');
    const result = patch.apply(new BinFile(source), true);
    const bytes = result._u8array.buffer;
    if (await digest('SHA-256', bytes) !== data.sha256) throw new Error('The generated game does not match the expected result.');
    self.postMessage({ bytes }, [bytes]);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
