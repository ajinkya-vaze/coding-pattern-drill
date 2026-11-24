// localStorage wrapper. Private windows or blocked storage can throw, so every
// access is guarded and the game keeps working in memory.

import { emptyState } from './scheduler.js';

const KEY = 'pattern-drill:v1';
let memory = null;

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const base = emptyState();
      return { ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } };
    }
  } catch {
    if (memory) return memory;
  }
  return memory || emptyState();
}

export function saveState(state) {
  memory = state;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function storageAvailable() {
  try {
    const k = `${KEY}:probe`;
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
