// Velvet v1.6: content fingerprints so re-importing the same file is skipped (Library, Vault and Archive alike).
// qh = SHA-256 of (size, first 64 KB, last 64 KB): fast, read from the encrypted store chunk-wise for old items.
// fh = full SHA-256 of the bytes: computed only to confirm a qh match. Both live in the encrypted index.
const SAMPLE = 64 * 1024, PIECE = 4 * 1024 * 1024;
const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
export const fileReader = f => ({ size: f.size, read: async (o, n) => new Uint8Array(await f.slice(o, o + n).arrayBuffer()) });

export async function quick(rd) {
  const n = rd.size, head = await rd.read(0, Math.min(SAMPLE, n)), tail = n > SAMPLE ? await rd.read(Math.max(SAMPLE, n - SAMPLE), Math.min(SAMPLE, n - SAMPLE)) : new Uint8Array(0);
  const sz = new TextEncoder().encode(String(n) + ':'), all = new Uint8Array(sz.length + head.length + tail.length);
  all.set(sz, 0); all.set(head, sz.length); all.set(tail, sz.length + head.length);
  return hex(await crypto.subtle.digest('SHA-256', all)).slice(0, 40);
}

/* streaming SHA-256 (WebCrypto has no incremental API; this keeps memory flat for big videos) */
const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export class Sha256 {
  constructor() { this.h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]); this.buf = new Uint8Array(64); this.bl = 0; this.len = 0; this.w = new Uint32Array(64); }
  block(d, o) {
    const w = this.w, h = this.h;
    for (let i = 0; i < 16; i++) w[i] = (d[o + 4 * i] << 24) | (d[o + 4 * i + 1] << 16) | (d[o + 4 * i + 2] << 8) | d[o + 4 * i + 3];
    for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + w[i - 16] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10)) + w[i - 7] | 0; }
    let A = h[0], B = h[1], C = h[2], D = h[3], E = h[4], F = h[5], G = h[6], H = h[7];
    for (let i = 0; i < 64; i++) {
      const t1 = H + (((E >>> 6) | (E << 26)) ^ ((E >>> 11) | (E << 21)) ^ ((E >>> 25) | (E << 7))) + ((E & F) ^ (~E & G)) + K[i] + w[i] | 0;
      const t2 = (((A >>> 2) | (A << 30)) ^ ((A >>> 13) | (A << 19)) ^ ((A >>> 22) | (A << 10))) + ((A & B) ^ (A & C) ^ (B & C)) | 0;
      H = G; G = F; F = E; E = D + t1 | 0; D = C; C = B; B = A; A = t1 + t2 | 0;
    }
    h[0] += A; h[1] += B; h[2] += C; h[3] += D; h[4] += E; h[5] += F; h[6] += G; h[7] += H;
  }
  update(d) {
    let i = 0; this.len += d.length;
    if (this.bl) { while (this.bl < 64 && i < d.length) this.buf[this.bl++] = d[i++]; if (this.bl === 64) { this.block(this.buf, 0); this.bl = 0; } }
    for (; i + 64 <= d.length; i += 64) this.block(d, i);
    while (i < d.length) this.buf[this.bl++] = d[i++];
  }
  digest() {
    const bits = this.len * 8, pad = new Uint8Array(((this.bl < 56) ? 56 : 120) - this.bl + 8); pad[0] = 0x80;
    const hi = Math.floor(bits / 2 ** 32), lo = bits >>> 0, e = pad.length;
    pad[e - 8] = hi >>> 24; pad[e - 7] = hi >>> 16; pad[e - 6] = hi >>> 8; pad[e - 5] = hi; pad[e - 4] = lo >>> 24; pad[e - 3] = lo >>> 16; pad[e - 2] = lo >>> 8; pad[e - 1] = lo;
    this.update(pad); const out = new Uint8Array(32); for (let i = 0; i < 8; i++) { out[4 * i] = this.h[i] >>> 24; out[4 * i + 1] = this.h[i] >>> 16; out[4 * i + 2] = this.h[i] >>> 8; out[4 * i + 3] = this.h[i]; }
    return hex(out.buffer);
  }
}
export async function full(rd) {
  if (rd.size <= 32 * 1024 * 1024) return hex(await crypto.subtle.digest('SHA-256', await rd.read(0, rd.size)));
  const h = new Sha256();
  for (let o = 0; o < rd.size; o += PIECE) { h.update(await rd.read(o, Math.min(PIECE, rd.size - o))); if ((o / PIECE) % 8 === 7) await new Promise(r => setTimeout(r, 0)); }
  return h.digest();
}
