// Progress code: the whole progress state, deflated and base64url-encoded,
// so it can be copied between devices (or sent as a #import= link).
// Importing merges record-by-record: the newer updatedAt wins.

import { emptyState } from './scheduler.js';

export const PREFIX = 'PD1.';

function bytesToBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** Only the parts worth moving between devices (settings stay per device). */
export function portable(state) {
  return { v: 1, problems: state.problems, patterns: state.patterns, reports: state.reports };
}

export async function encodeProgress(state) {
  const json = new TextEncoder().encode(JSON.stringify(portable(state)));
  const packed = await pipe(json, new CompressionStream('deflate-raw'));
  return PREFIX + bytesToBase64Url(packed);
}

export async function decodeProgress(code) {
  const text = String(code || '').trim().replace(/\s+/g, '');
  if (!text.startsWith(PREFIX)) throw new Error('Not a progress code (it should start with PD1.)');
  let parsed;
  try {
    const bytes = base64UrlToBytes(text.slice(PREFIX.length));
    const json = await pipe(bytes, new DecompressionStream('deflate-raw'));
    parsed = JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new Error('This progress code is damaged or incomplete. Copy it again.');
  }
  if (!parsed || parsed.v !== 1 || typeof parsed.problems !== 'object' || typeof parsed.patterns !== 'object') {
    throw new Error('This progress code is from an unknown version.');
  }
  return { problems: parsed.problems || {}, patterns: parsed.patterns || {}, reports: Array.isArray(parsed.reports) ? parsed.reports : [] };
}

function mergeMap(local, incoming) {
  const out = { ...local };
  let taken = 0;
  for (const [id, rec] of Object.entries(incoming || {})) {
    if (!rec || typeof rec !== 'object') continue;
    if (!out[id] || (rec.updatedAt || 0) > (out[id].updatedAt || 0)) {
      out[id] = rec;
      taken += 1;
    }
  }
  return { merged: out, taken };
}

/** Merge an imported payload into the local state. Returns a new state plus a summary. */
export function mergeProgress(localState, incoming) {
  const base = { ...emptyState(), ...localState };
  const p = mergeMap(base.problems, incoming.problems);
  const pat = mergeMap(base.patterns, incoming.patterns);
  const seen = new Set(base.reports.map((r) => `${r.id}|${r.at}`));
  const newReports = (incoming.reports || []).filter((r) => r && !seen.has(`${r.id}|${r.at}`));
  return {
    state: { ...base, problems: p.merged, patterns: pat.merged, reports: [...base.reports, ...newReports] },
    summary: { problems: p.taken, patterns: pat.taken, reports: newReports.length },
  };
}
