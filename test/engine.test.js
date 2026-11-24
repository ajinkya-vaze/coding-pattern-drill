import { test, ok, eq, rejects } from './harness.js';
import {
  emptyState, recordRecognise, recordProbe, recordRecall, getRecord, STAGE, INTERVALS,
  buildSession, interleave, markLearned, patternStatus, drillComplete, levelFor,
  recordTwist, twistFor, recentAccuracy,
} from '../src/engine/scheduler.js';
import { validateTwist } from '../src/engine/validate.js';
import { buildAliasIndex, classify, gradeRecall, normalise, levenshtein } from '../src/engine/grading.js';
import { encodeProgress, decodeProgress, mergeProgress, PREFIX } from '../src/engine/progressCode.js';
import { buildRecognise, buildProbe, triggerRange } from '../src/engine/questions.js';
import { epochDay, seededRng } from '../src/engine/util.js';

const DAY = 86400000;
const T0 = Date.UTC(2026, 10, 24, 12);

// ---------- scheduler ----------

test('L1 correct promotes to L2; peeking does not', () => {
  const s = emptyState();
  recordRecognise(s, 'a', { correct: true, peeked: true }, T0);
  eq(getRecord(s, 'a').stage, STAGE.RECOGNISE);
  recordRecognise(s, 'a', { correct: true }, T0);
  eq(getRecord(s, 'a').stage, STAGE.PROBE);
  eq(getRecord(s, 'a').hist, 'h+');
});

test('L1 wrong stays at L1', () => {
  const s = emptyState();
  recordRecognise(s, 'a', { correct: false }, T0);
  eq(getRecord(s, 'a').stage, STAGE.RECOGNISE);
});

test('L2 all-correct promotes to L3, a miss keeps L2', () => {
  const s = emptyState();
  recordRecognise(s, 'a', { correct: true }, T0);
  recordProbe(s, 'a', { allCorrect: false }, T0);
  eq(getRecord(s, 'a').stage, STAGE.PROBE);
  recordProbe(s, 'a', { allCorrect: true }, T0);
  eq(getRecord(s, 'a').stage, STAGE.RECALL);
  eq(levelFor(getRecord(s, 'a')), 3);
});

test('L3 clean pass masters; reviews climb Leitner boxes', () => {
  const s = emptyState();
  s.problems.a = { stage: STAGE.RECALL, box: 0, due: 0, hist: '', overrides: 0, masteredDay: null, updatedAt: 1 };
  recordRecall(s, 'a', { correct: true }, T0);
  let r = getRecord(s, 'a');
  eq(r.stage, STAGE.MASTERED);
  eq(r.due, epochDay(T0) + INTERVALS[0]);
  eq(r.masteredDay, epochDay(T0));
  recordRecall(s, 'a', { correct: true }, T0 + DAY);
  r = getRecord(s, 'a');
  eq(r.box, 1);
  eq(r.due, epochDay(T0 + DAY) + INTERVALS[1]);
});

test('L3 with a hint does not master', () => {
  const s = emptyState();
  s.problems.a = { stage: STAGE.RECALL, box: 0, due: 0, hist: '', overrides: 0, masteredDay: null, updatedAt: 1 };
  recordRecall(s, 'a', { correct: true, hinted: true }, T0);
  eq(getRecord(s, 'a').stage, STAGE.RECALL);
});

test('missing a mastered review drops back to L2', () => {
  const s = emptyState();
  s.problems.a = { stage: STAGE.MASTERED, box: 3, due: 0, hist: '', overrides: 0, masteredDay: 5, updatedAt: 1 };
  recordRecall(s, 'a', { correct: false }, T0);
  const r = getRecord(s, 'a');
  eq([r.stage, r.box, r.masteredDay], [STAGE.PROBE, 0, null]);
});

test('override counts as correct but is tallied', () => {
  const s = emptyState();
  s.problems.a = { stage: STAGE.RECALL, box: 0, due: 0, hist: '', overrides: 0, masteredDay: null, updatedAt: 1 };
  recordRecall(s, 'a', { correct: true, override: true }, T0);
  eq(getRecord(s, 'a').overrides, 1);
  eq(getRecord(s, 'a').hist, 'o');
});

// ---------- L4 twists ----------

const TWISTED = { id: 'a', pattern: 'hashing', twists: [{ pattern: 'two-pointers' }, { pattern: 'prefix-sum' }] };
const mastered = (extra = {}) => ({ stage: STAGE.MASTERED, box: 0, due: 0, hist: '', overrides: 0, masteredDay: 1, updatedAt: 1, ...extra });

test('mastering at L3 makes the next review a twist, only if the problem has twists', () => {
  const s = emptyState();
  s.problems.a = { stage: STAGE.RECALL, box: 0, due: 0, hist: '', overrides: 0, masteredDay: null, updatedAt: 1 };
  recordRecall(s, 'a', { correct: true }, T0);
  const r = getRecord(s, 'a');
  eq(levelFor(r, TWISTED), 4);
  eq(levelFor(r, { id: 'a', pattern: 'hashing' }), 3);
  eq(levelFor(r), 3);
  eq(twistFor(r, TWISTED).pattern, 'two-pointers');
});

test('a record from before twists existed defaults to L3 with no twist pending', () => {
  const s = emptyState();
  s.problems.a = { stage: STAGE.MASTERED, box: 2, due: 0, hist: '+', overrides: 0, masteredDay: 1, updatedAt: 1 };
  const r = getRecord(s, 'a');
  eq([r.tw, r.l4, r.slow], [0, false, 0]);
  eq(levelFor(r, TWISTED), 3);
});

test('L4 clean pass climbs a box, moves to the next twist and alternates back to L3', () => {
  const s = emptyState();
  s.problems.a = mastered({ box: 1, l4: true });
  recordTwist(s, 'a', { correct: true }, T0);
  let r = getRecord(s, 'a');
  eq([r.stage, r.box, r.tw, r.l4], [STAGE.MASTERED, 2, 1, false]);
  eq(r.due, epochDay(T0) + INTERVALS[2]);
  eq(levelFor(r, TWISTED), 3);
  recordRecall(s, 'a', { correct: true }, T0 + 7 * DAY);
  r = getRecord(s, 'a');
  eq(levelFor(r, TWISTED), 4);
  eq(twistFor(r, TWISTED).pattern, 'prefix-sum');
  recordTwist(s, 'a', { correct: true }, T0 + 20 * DAY);
  eq(twistFor(getRecord(s, 'a'), TWISTED).pattern, 'two-pointers', 'twists cycle');
});

test('L4 hinted pass keeps the same twist due today', () => {
  const s = emptyState();
  s.problems.a = mastered({ box: 2, l4: true });
  recordTwist(s, 'a', { correct: true, hinted: true }, T0);
  const r = getRecord(s, 'a');
  eq([r.box, r.tw, r.l4, r.due, r.hist], [2, 0, true, epochDay(T0), 'h']);
});

test('L4 miss keeps the problem mastered but resets the box and retries the twist tomorrow', () => {
  const s = emptyState();
  s.problems.a = mastered({ box: 3, l4: true, masteredDay: 7 });
  recordTwist(s, 'a', { correct: false }, T0);
  const r = getRecord(s, 'a');
  eq([r.stage, r.box, r.tw, r.l4, r.masteredDay], [STAGE.MASTERED, 0, 0, true, 7]);
  eq(r.due, epochDay(T0) + 1);
  eq(levelFor(r, TWISTED), 4);
});

test('a slow answer still passes but is logged and tallied', () => {
  const s = emptyState();
  s.problems.a = { stage: STAGE.RECALL, box: 0, due: 0, hist: '', overrides: 0, masteredDay: null, updatedAt: 1 };
  recordRecall(s, 'a', { correct: true, slow: true }, T0);
  let r = getRecord(s, 'a');
  eq([r.stage, r.hist, r.slow], [STAGE.MASTERED, 's', 1]);
  recordTwist(s, 'a', { correct: false, slow: true }, T0 + DAY);
  r = getRecord(s, 'a');
  eq([r.hist, r.slow], ['s-', 2]);
  eq(recentAccuracy(r), 0.5);
});

test('the timer setting is off by default', () => {
  eq(emptyState().settings.timer, false);
});

const IDS = new Set(['hashing', 'two-pointers', 'prefix-sum', 'binary-search', 'sliding-window']);
const BASE_Q = { id: 'two-sum', pattern: 'hashing', statement: 'Find two numbers that add up to target.' };
const GOOD_TWIST = {
  change: 'The array is sorted.',
  statement: 'The array is sorted in non-decreasing order. Find two numbers that add up to target in O(1) space.',
  pattern: 'two-pointers', alternates: ['binary-search'], trigger: 'sorted in non-decreasing order',
  ds: 'Two int indices', why: 'Sorted order lets the ends converge.', approach: 'Move lo or hi by the sum.',
  nearMiss: [{ p: 'hashing', why: 'Works but O(n) space.' }, { p: 'sliding-window', why: 'Not contiguous.' }, { p: 'prefix-sum', why: 'Not a range sum.' }],
};
const twistErrors = (t) => { const out = []; validateTwist(t, BASE_Q, IDS, (m) => out.push(m)); return out; };

test('a well-formed twist validates', () => {
  eq(twistErrors(GOOD_TWIST), []);
});

test('twist validation catches an unchanged pattern, a missing trap and a trigger not in the statement', () => {
  ok(twistErrors({ ...GOOD_TWIST, pattern: 'hashing' }).some((e) => /must change the pattern/.test(e)));
  ok(twistErrors({ ...GOOD_TWIST, alternates: ['hashing'] }).some((e) => /must change the pattern/.test(e)));
  ok(twistErrors({ ...GOOD_TWIST, trigger: 'unsorted' }).some((e) => /not in the twist statement/.test(e)));
  const noTrap = { ...GOOD_TWIST, nearMiss: [{ p: 'sliding-window', why: 'a' }, { p: 'prefix-sum', why: 'b' }, { p: 'binary-search', why: 'c' }] };
  const errs = twistErrors(noTrap);
  ok(errs.some((e) => /include the original pattern/.test(e)), errs.join('; '));
  ok(errs.some((e) => /also an accepted alternate/.test(e)), errs.join('; '));
  ok(twistErrors({ ...GOOD_TWIST, ds: '' }).some((e) => /missing ds/.test(e)));
  ok(twistErrors({ ...GOOD_TWIST, nearMiss: GOOD_TWIST.nearMiss.slice(0, 2) }).some((e) => /exactly 3/.test(e)));
});

const P = (id, pattern) => ({ id, pattern });

test('session only uses learned patterns unless told otherwise', () => {
  const s = emptyState();
  const probs = [P('a', 'x'), P('b', 'y')];
  eq(buildSession(s, probs, { now: T0 }), []);
  markLearned(s, 'x', T0);
  eq(buildSession(s, probs, { now: T0 }), ['a']);
  eq(buildSession(s, probs, { now: T0, includeUnlearned: true, rng: seededRng(1) }).length, 2);
});

test('session puts due reviews first and skips reviews not yet due', () => {
  const s = emptyState();
  markLearned(s, 'x', T0);
  markLearned(s, 'y', T0);
  const today = epochDay(T0);
  s.problems.due = { stage: STAGE.MASTERED, box: 1, due: today, hist: '', overrides: 0, masteredDay: 1, updatedAt: 1 };
  s.problems.later = { stage: STAGE.MASTERED, box: 1, due: today + 3, hist: '', overrides: 0, masteredDay: 1, updatedAt: 1 };
  const ids = buildSession(s, [P('new', 'x'), P('due', 'y'), P('later', 'x')], { now: T0, rng: seededRng(2) });
  eq(ids, ['due', 'new']);
});

test('interleave avoids consecutive same pattern when possible', () => {
  const out = interleave([P('1', 'a'), P('2', 'a'), P('3', 'b'), P('4', 'b')]).map((p) => p.pattern);
  for (let i = 1; i < out.length; i++) ok(out[i] !== out[i - 1], `adjacent ${out.join(',')}`);
});

test('pattern status: new → learning → learned → mastered', () => {
  const s = emptyState();
  const probs = [P('a', 'x'), P('b', 'x')];
  eq(patternStatus(s, 'x', probs), 'new');
  recordRecognise(s, 'a', { correct: true }, T0);
  eq(patternStatus(s, 'x', probs), 'learning');
  recordProbe(s, 'a', { allCorrect: true }, T0);
  recordRecognise(s, 'b', { correct: true }, T0);
  recordProbe(s, 'b', { allCorrect: true }, T0);
  ok(drillComplete(s, probs));
  markLearned(s, 'x', T0);
  eq(patternStatus(s, 'x', probs), 'learned');
  recordRecall(s, 'a', { correct: true }, T0);
  recordRecall(s, 'b', { correct: true }, T0);
  eq(patternStatus(s, 'x', probs), 'learned', 'same day should not count twice');
  s.problems.b.masteredDay = epochDay(T0) + 1;
  eq(patternStatus(s, 'x', probs), 'mastered');
});

// ---------- grading ----------

const PATTERNS = [
  { id: 'stack', name: 'Stack (matching / parsing)', aliases: ['stack', 'parentheses stack'] },
  { id: 'monotonic-stack', name: 'Monotonic stack', parent: 'stack', aliases: ['monotonic stack', 'mono stack', 'next greater element'] },
  { id: 'sliding-window', name: 'Sliding window', aliases: ['sliding window', 'window'] },
  { id: 'two-pointers', name: 'Two pointers', aliases: ['two pointer', 'left right pointer'] },
  { id: 'fast-slow', name: 'Fast & slow pointers', aliases: ['fast slow pointer', 'floyd', 'tortoise hare'] },
  { id: 'heap-topk', name: 'Heap / top-k', aliases: ['heap', 'priority queue', 'top k'] },
  { id: 'two-heaps', name: 'Two heaps', parent: 'heap-topk', aliases: ['two heap'] },
  { id: 'partition', name: 'Quickselect / partition', aliases: ['quickselect', 'quick select'] },
  { id: 'dp-1d', name: '1D DP', aliases: ['1d dp', 'one dimensional dp'] },
  { id: 'dp-2d', name: '2D DP', aliases: ['2d dp'] },
  { id: 'tree-dfs', name: 'Tree DFS', aliases: ['tree dfs'] },
  { id: 'graph-traversal', name: 'Graph / grid traversal', aliases: ['flood fill'] },
];
const PBYID = Object.fromEntries(PATTERNS.map((p) => [p.id, p]));
const FAMILIES = [
  { id: 'dp', name: 'Dynamic programming', aliases: ['dp', 'dynamic programming'], members: ['dp-1d', 'dp-2d'], accept: [] },
  { id: 'dfs', name: 'Depth-first search', aliases: ['dfs'], members: ['tree-dfs', 'graph-traversal'], accept: ['tree-dfs', 'graph-traversal'] },
];
const INDEX = buildAliasIndex(PATTERNS, FAMILIES);
const grade = (answer, problem) => gradeRecall(answer, problem, INDEX, FAMILIES, PBYID).verdict;

test('normalise folds plurals, hyphens and digits', () => {
  eq(normalise('Two-Pointers!'), 'two pointer');
  eq(normalise('2 pointers'), 'two pointer');
  eq(normalise('Expand around centre'), 'expand around center');
});

test('levenshtein basics', () => {
  eq(levenshtein('kitten', 'sitting'), 3);
  eq(levenshtein('', 'abc'), 3);
});

test('exact alias, typo and token containment all classify', () => {
  eq(classify('sliding window', INDEX), { kind: 'pattern', id: 'sliding-window' });
  eq(classify('slidng windw', INDEX), { kind: 'pattern', id: 'sliding-window' });
  eq(classify('use a min heap of size k', INDEX), { kind: 'pattern', id: 'heap-topk' });
  eq(classify('fast and slow pointers', INDEX), { kind: 'pattern', id: 'fast-slow' });
});

test('"stack" is only close for monotonic-stack; the reverse is wrong', () => {
  eq(grade('stack', { pattern: 'monotonic-stack' }), 'family');
  eq(grade('monotonic stack', { pattern: 'stack' }), 'wrong');
  eq(grade('mono stack', { pattern: 'monotonic-stack' }), 'correct');
});

test('two heaps is not plain heap; plain heap is close for two heaps', () => {
  eq(grade('two heaps', { pattern: 'heap-topk' }), 'wrong');
  eq(grade('two heaps', { pattern: 'two-heaps' }), 'correct');
  eq(grade('heap', { pattern: 'two-heaps' }), 'family');
});

test('accepted alternates pass', () => {
  const kth = { pattern: 'heap-topk', alternates: ['partition'] };
  eq(grade('quickselect', kth), 'correct');
  eq(grade('heap', kth), 'correct');
});

test('generic family answers: dp is close, dfs is accepted for graphs', () => {
  eq(grade('dp', { pattern: 'dp-1d' }), 'family');
  eq(grade('dynamic programming', { pattern: 'sliding-window' }), 'wrong');
  eq(grade('DFS', { pattern: 'graph-traversal' }), 'correct');
  eq(grade('dfs', { pattern: 'sliding-window' }), 'wrong');
});

test('gibberish and empty answers are wrong', () => {
  eq(grade('', { pattern: 'stack' }), 'wrong');
  eq(grade('banana', { pattern: 'stack' }), 'wrong');
});

// ---------- progress code ----------

test('progress code round-trips', async () => {
  const s = emptyState();
  recordRecognise(s, 'two-sum', { correct: true }, T0);
  markLearned(s, 'hashing', T0);
  s.reports.push({ id: 'two-sum', q: 'time', note: 'typo', at: T0 });
  const code = await encodeProgress(s);
  ok(code.startsWith(PREFIX));
  ok(!/[+/=]/.test(code.slice(PREFIX.length)), 'base64url only');
  const back = await decodeProgress(code);
  eq(back.problems, s.problems);
  eq(back.patterns, s.patterns);
  eq(back.reports, s.reports);
});

test('merge keeps the newer record on each side', () => {
  const local = emptyState();
  local.problems.a = { stage: 4, updatedAt: 200 };
  local.problems.b = { stage: 1, updatedAt: 100 };
  const incoming = { problems: { a: { stage: 2, updatedAt: 150 }, b: { stage: 3, updatedAt: 300 }, c: { stage: 2, updatedAt: 5 } }, patterns: {}, reports: [] };
  const { state, summary } = mergeProgress(local, incoming);
  eq(state.problems.a.stage, 4);
  eq(state.problems.b.stage, 3);
  eq(state.problems.c.stage, 2);
  eq(summary.problems, 2);
});

test('merge does not duplicate reports', () => {
  const local = emptyState();
  local.reports = [{ id: 'a', at: 1 }];
  const { state } = mergeProgress(local, { problems: {}, patterns: {}, reports: [{ id: 'a', at: 1 }, { id: 'b', at: 2 }] });
  eq(state.reports.length, 2);
});

test('malformed codes are rejected with a clear message', async () => {
  await rejects(() => decodeProgress('hello'), /PD1/);
  await rejects(() => decodeProgress('PD1.!!!notbase64'), /damaged/);
  await rejects(() => decodeProgress('PD1.AAAA'), /damaged|unknown/);
});

test('whitespace and line breaks inside a pasted code are tolerated', async () => {
  const s = emptyState();
  recordRecognise(s, 'x', { correct: true }, T0);
  const code = await encodeProgress(s);
  const mangled = ` ${code.slice(0, 10)}\n${code.slice(10)} `;
  eq((await decodeProgress(mangled)).problems, s.problems);
});

// ---------- questions ----------

const PBY = {
  a: { id: 'a', name: 'Pattern A' }, b: { id: 'b', name: 'Pattern B' },
  c: { id: 'c', name: 'Pattern C' }, d: { id: 'd', name: 'Pattern D' },
};
const PROB = {
  id: 'q', pattern: 'a', statement: 'Find the longest contiguous run with at most k zeros.',
  nearMiss: [{ p: 'b', why: 'b fails' }, { p: 'c', why: 'c fails' }, { p: 'd', why: 'd fails' }],
  trigger: { answer: 'longest contiguous', wrong: ['x', 'y', 'z'], why: 'w' },
  ds: { answer: 'A', wrong: ['B', 'C', 'D'], why: 'w' },
  invariant: { answer: 'A', wrong: ['B', 'C', { t: 'D', why: 'nope' }], why: 'w' },
  time: { answer: 'O(n)', wrong: ['O(n^2)', 'O(log n)', 'O(n log n)'], why: 'w' },
  space: { answer: 'O(1)', wrong: ['O(n)', 'O(k)', 'O(n^2)'], why: 'w' },
  whyNot: { wrong: ['p', 'q', 'r'] },
};

test('L1 has one correct option and the three near-misses', () => {
  const q = buildRecognise(PROB, PBY, seededRng(3));
  eq(q.options.length, 4);
  eq(q.options.filter((o) => o.correct).map((o) => o.id), ['a']);
  eq(q.options.map((o) => o.id).sort(), ['a', 'b', 'c', 'd']);
});

test('L2 chain has six steps each with exactly one correct option', () => {
  const steps = buildProbe(PROB, PBY, seededRng(4));
  eq(steps.map((s) => s.key), ['trigger', 'ds', 'invariant', 'time', 'space', 'whyNot']);
  for (const s of steps) eq(s.options.filter((o) => o.correct).length, 1, s.key);
  ok(steps[5].title.includes('Pattern B'));
  ok(steps[2].options.some((o) => o.why === 'nope'));
});

test('trigger range locates the phrase case-insensitively', () => {
  eq(triggerRange(PROB), [9, 27]);
});
