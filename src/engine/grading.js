// L3 free-text grading. The typed answer is first classified to the single
// best-matching pattern (or a generic family such as "dp"), and only then
// compared with the problem's pattern and accepted alternates. Classifying
// first stops "monotonic stack" from passing a plain "stack" problem.

const REPLACEMENTS = [
  [/\bpointers\b/g, 'pointer'],
  [/\bheaps\b/g, 'heap'],
  [/\bstacks\b/g, 'stack'],
  [/\bwindows\b/g, 'window'],
  [/\bintervals\b/g, 'interval'],
  [/\bmaps\b/g, 'map'],
  [/\bsets\b/g, 'set'],
  [/\bsums\b/g, 'sum'],
  [/\btries\b/g, 'trie'],
  [/\bqueues\b/g, 'queue'],
  [/\bgraphs\b/g, 'graph'],
  [/\btrees\b/g, 'tree'],
  [/\bcentre\b/g, 'center'],
  [/\bsearching\b/g, 'search'],
  [/\b2\b/g, 'two'],
];

export function normalise(text) {
  let s = String(text || '').toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();
  for (const [re, to] of REPLACEMENTS) s = s.replace(re, to);
  return s.replace(/\s+/g, ' ').trim();
}

function tokens(s) {
  return s ? s.split(' ') : [];
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Build the alias index once per bank.
 * entries: [{ alias, aliasTokens, target: { kind: 'pattern'|'family', id } }]
 */
export function buildAliasIndex(patterns, families = []) {
  const entries = [];
  const add = (alias, target) => {
    const a = normalise(alias);
    if (a) entries.push({ alias: a, aliasTokens: tokens(a), target });
  };
  for (const p of patterns) {
    add(p.name, { kind: 'pattern', id: p.id });
    add(p.id.replace(/-/g, ' '), { kind: 'pattern', id: p.id });
    for (const al of p.aliases || []) add(al, { kind: 'pattern', id: p.id });
  }
  for (const f of families) {
    add(f.name, { kind: 'family', id: f.id });
    for (const al of f.aliases || []) add(al, { kind: 'family', id: f.id });
  }
  return entries;
}

/** Return the best target for a typed answer, or null. */
export function classify(answer, index) {
  const a = normalise(answer);
  if (!a) return null;
  const exact = index.find((e) => e.alias === a);
  if (exact) return exact.target;

  // Every token of an alias appears in the answer: prefer the longest alias,
  // and prefer a specific pattern over a generic family on ties.
  const answerTokens = new Set(tokens(a));
  let best = null;
  for (const e of index) {
    if (e.aliasTokens.every((t) => answerTokens.has(t))) {
      const score = e.aliasTokens.length * 2 + (e.target.kind === 'pattern' ? 1 : 0);
      if (!best || score > best.score) best = { score, target: e.target };
    }
  }
  if (best) return best.target;

  // Typos: whole-answer edit distance against each alias.
  let typo = null;
  for (const e of index) {
    const limit = e.alias.length <= 5 ? 1 : 2;
    const d = levenshtein(a, e.alias);
    if (d <= limit && (!typo || d < typo.d)) typo = { d, target: e.target };
  }
  return typo ? typo.target : null;
}

/**
 * Grade a typed answer for a problem.
 * verdict: 'correct' | 'family' (right idea, not specific enough) | 'wrong'
 *
 * - A pattern match is correct if it is the problem's pattern or an accepted alternate.
 * - Naming the *parent* of the right pattern ("stack" for a monotonic-stack
 *   problem, "binary search" for binary-search-on-answer) is 'family'.
 * - A family alias ("dfs", "dp") is correct when the family lists the right
 *   pattern under `accept`, 'family' when it is only under `members`.
 */
export function gradeRecall(answer, problem, index, families = [], patternsById = {}) {
  const target = classify(answer, index);
  if (!target) return { verdict: 'wrong', matched: null };
  const accepted = [problem.pattern, ...(problem.alternates || [])];
  if (target.kind === 'pattern') {
    if (accepted.includes(target.id)) return { verdict: 'correct', matched: target };
    const isParent = accepted.some((id) => patternsById[id]?.parent === target.id);
    return { verdict: isParent ? 'family' : 'wrong', matched: target };
  }
  const fam = families.find((f) => f.id === target.id);
  if (fam && accepted.some((id) => (fam.accept || []).includes(id))) return { verdict: 'correct', matched: target };
  if (fam && accepted.some((id) => (fam.members || []).includes(id))) return { verdict: 'family', matched: target };
  return { verdict: 'wrong', matched: target };
}
