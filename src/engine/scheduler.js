// The per-problem ladder (L1 → L2 → L3 → Mastered), Leitner spacing for
// mastered problems, pattern status, and the interleaved session builder.

import { epochDay, shuffle } from './util.js';

export const STAGE = Object.freeze({ RECOGNISE: 1, PROBE: 2, RECALL: 3, MASTERED: 4 });

/** Days until the next review, indexed by Leitner box. */
export const INTERVALS = [1, 3, 7, 16, 35];

const HISTORY_LEN = 8;

export function emptyState() {
  return {
    v: 1,
    problems: {},
    patterns: {},
    reports: [],
    settings: { includeUnlearned: false, sessionSize: 10 },
    lastExport: 0,
  };
}

export function defaultRecord() {
  return { stage: STAGE.RECOGNISE, box: 0, due: 0, hist: '', overrides: 0, masteredDay: null, updatedAt: 0 };
}

export function getRecord(state, id) {
  return state.problems[id] ? { ...defaultRecord(), ...state.problems[id] } : defaultRecord();
}

function save(state, id, rec, mark, now) {
  rec.hist = (rec.hist + mark).slice(-HISTORY_LEN);
  rec.updatedAt = now;
  state.problems[id] = rec;
  return rec;
}

/**
 * L1: name the pattern from 4 options.
 * A correct answer without peeking moves the problem to L2.
 */
export function recordRecognise(state, id, { correct, peeked = false }, now = Date.now()) {
  const rec = getRecord(state, id);
  const pass = correct && !peeked;
  if (pass && rec.stage === STAGE.RECOGNISE) rec.stage = STAGE.PROBE;
  return save(state, id, rec, pass ? '+' : correct ? 'h' : '-', now);
}

/**
 * L2: the probe chain (trigger, Java DS, invariant, time, space, why-not).
 * All correct moves the problem to L3 (asked from the next session on).
 */
export function recordProbe(state, id, { allCorrect }, now = Date.now()) {
  const rec = getRecord(state, id);
  if (allCorrect && rec.stage === STAGE.PROBE) {
    rec.stage = STAGE.RECALL;
    rec.due = epochDay(now);
  }
  return save(state, id, rec, allCorrect ? '+' : '-', now);
}

/**
 * L3: name the pattern with no options.
 * - Correct, no hint, at L3 → Mastered (box 0, review tomorrow).
 * - Correct, no hint, already Mastered → next Leitner box.
 * - Correct with a hint → attempt logged, stage unchanged.
 * - Wrong while Mastered → back to L2.
 * An "I meant that" override counts as correct but is tallied separately.
 */
export function recordRecall(state, id, { correct, hinted = false, override = false }, now = Date.now()) {
  const rec = getRecord(state, id);
  const today = epochDay(now);
  if (override) rec.overrides += 1;
  let mark;
  if (correct && !hinted) {
    mark = override ? 'o' : '+';
    if (rec.stage === STAGE.MASTERED) {
      rec.box = Math.min(rec.box + 1, INTERVALS.length - 1);
    } else {
      rec.stage = STAGE.MASTERED;
      rec.box = 0;
      rec.masteredDay = today;
    }
    rec.due = today + INTERVALS[rec.box];
  } else if (correct && hinted) {
    mark = 'h';
    rec.due = today;
  } else {
    mark = '-';
    if (rec.stage === STAGE.MASTERED) {
      rec.stage = STAGE.PROBE;
      rec.box = 0;
      rec.masteredDay = null;
    }
    rec.due = today;
  }
  return save(state, id, rec, mark, now);
}

/** Which level a problem is asked at next. */
export function levelFor(rec) {
  if (rec.stage === STAGE.RECOGNISE) return 1;
  if (rec.stage === STAGE.PROBE) return 2;
  return 3;
}

export function isLearned(state, patternId) {
  return Boolean(state.patterns[patternId]?.learned);
}

export function markLearned(state, patternId, now = Date.now()) {
  state.patterns[patternId] = { learned: true, updatedAt: now };
}

/** A pattern's drill is complete when every one of its problems has reached L3. */
export function drillComplete(state, problemsOfPattern) {
  return problemsOfPattern.length > 0 && problemsOfPattern.every((p) => getRecord(state, p.id).stage >= STAGE.RECALL);
}

/**
 * new: never drilled · learning: drill started · learned: drill done ·
 * mastered: ≥2 problems (or all, if fewer) mastered on distinct days.
 */
export function patternStatus(state, patternId, problemsOfPattern) {
  const recs = problemsOfPattern.map((p) => getRecord(state, p.id));
  const days = new Set(recs.filter((r) => r.stage === STAGE.MASTERED).map((r) => r.masteredDay));
  const needed = Math.min(2, problemsOfPattern.length);
  if (isLearned(state, patternId) && needed > 0 && days.size >= needed) return 'mastered';
  if (isLearned(state, patternId)) return 'learned';
  if (recs.some((r) => r.updatedAt > 0)) return 'learning';
  return 'new';
}

/** Share of recent answers that were clean passes, or null if never attempted. */
export function recentAccuracy(rec) {
  if (!rec.hist) return null;
  const passes = [...rec.hist].filter((c) => c === '+').length;
  return passes / rec.hist.length;
}

/**
 * Build an interleaved session: due reviews first, then L3, L2, L1 work,
 * then arranged so the same pattern rarely appears twice in a row.
 */
export function buildSession(state, problems, { size = 10, includeUnlearned = false, now = Date.now(), rng = Math.random } = {}) {
  const today = epochDay(now);
  const pool = problems.filter((p) => includeUnlearned || isLearned(state, p.pattern));
  const buckets = { review: [], recall: [], probe: [], recognise: [] };
  for (const p of pool) {
    const rec = getRecord(state, p.id);
    if (rec.stage === STAGE.MASTERED) {
      if (rec.due <= today) buckets.review.push(p);
    } else if (rec.stage === STAGE.RECALL) buckets.recall.push(p);
    else if (rec.stage === STAGE.PROBE) buckets.probe.push(p);
    else buckets.recognise.push(p);
  }
  const ordered = [
    ...shuffle(buckets.review, rng),
    ...shuffle(buckets.recall, rng),
    ...shuffle(buckets.probe, rng),
    ...shuffle(buckets.recognise, rng),
  ].slice(0, size);
  return interleave(ordered).map((p) => p.id);
}

/** Reorder so consecutive items differ in pattern where possible (keeps priority roughly). */
export function interleave(items) {
  const remaining = items.slice();
  const out = [];
  while (remaining.length) {
    const last = out[out.length - 1];
    let idx = remaining.findIndex((p) => !last || p.pattern !== last.pattern);
    if (idx === -1) idx = 0;
    out.push(remaining.splice(idx, 1)[0]);
  }
  return out;
}

export function dueCount(state, problems, now = Date.now()) {
  const today = epochDay(now);
  return problems.filter((p) => {
    const rec = getRecord(state, p.id);
    return isLearned(state, p.pattern) && rec.stage === STAGE.MASTERED && rec.due <= today;
  }).length;
}
