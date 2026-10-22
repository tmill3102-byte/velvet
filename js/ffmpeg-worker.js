// Velvet v1.7 video tools worker: runs Velvet's own LGPL build of FFmpeg (WebAssembly) on this device.
// Input is mounted read-only from a Blob (WORKERFS, no copy); the result is returned as bytes and saved by the app
// as a NEW encrypted item. Cancelling terminates this worker.
let core = null, logs = [];
async function load(mt) {
  if (core) return core;
  const dir = new URL('../addons/ffmpeg/', import.meta.url).href, js = dir + (mt ? 'mt/' : '') + 'ffmpeg-core.js';
  const { default: create } = await import(js);
  const urls = { wasmURL: dir + (mt ? 'mt/' : '') + 'ffmpeg-core.wasm', workerURL: dir + 'mt/ffmpeg-core.worker.js' };
  core = await create({ mainScriptUrlOrBlob: js + '#' + btoa(JSON.stringify(urls)) });
  core.setLogger(({ message }) => { logs.push(message); if (logs.length > 400) logs.shift(); postMessage({ type: 'log', line: message }); });
  return core;
}
onmessage = async ({ data: m }) => {
  if (m.type !== 'run') return;
  try {
    const c = await load(m.mt); logs = [];
    const FS = c.FS; try { FS.mkdir('/in'); } catch (e) { }
    FS.mount(FS.filesystems.WORKERFS, { blobs: [{ name: m.name, data: m.file }] }, '/in');
    const args = m.args.map(a => a === '$IN' ? '/in/' + m.name : a);
    c.reset(); const ret = c.exec(...args);
    try { FS.unmount('/in'); } catch (e) { }
    let out = null;
    if (m.out) { try { out = FS.readFile(m.out); FS.unlink(m.out); } catch (e) { out = null; } }
    const buf = out ? out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) : null;
    postMessage({ type: 'done', ret, data: buf, log: logs.slice(-60) }, buf ? [buf] : []);
  } catch (e) { postMessage({ type: 'error', message: String(e && e.message || e), log: logs.slice(-60) }); }
};
