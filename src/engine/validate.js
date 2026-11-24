// Question-bank validator. Pure function so it runs in the browser test page
// and in CI (tools/run-tests.mjs).

import { buildAliasIndex, classify } from './grading.js';

const PROBES = ['trigger', 'ds', 'invariant', 'time', 'space'];
const KINDS = new Set(['article', 'video', 'reference']);
const DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);

function label(item) {
  return typeof item === 'string' ? item : item && item.t;
}

/**
 * L4 twist: the same problem with one constraint changed so the pattern
 * changes. Its near-misses must include the original pattern (the trap).
 */
export function validateTwist(t, q, patternIds, err) {
  for (const f of ['change', 'statement', 'trigger', 'ds', 'why', 'approach']) {
    if (typeof t?.[f] !== 'string' || !t[f].trim()) err(`missing ${f}`);
  }
  if (!t || typeof t !== 'object') return;
  if (!patternIds.has(t.pattern)) err(`unknown pattern ${t.pattern}`);
  const alternates = t.alternates || [];
  if (!Array.isArray(alternates)) err('alternates must be an array');
  for (const a of alternates) if (!patternIds.has(a)) err(`unknown alternate ${a}`);
  if (t.pattern === q.pattern || alternates.includes(q.pattern)) {
    err(`the twist must change the pattern, but ${q.pattern} is still accepted`);
  }
  if (t.statement && t.trigger && !t.statement.toLowerCase().includes(t.trigger.toLowerCase())) {
    err(`trigger phrase "${t.trigger}" is not in the twist statement`);
  }
  if (t.statement && q.statement && t.statement.trim() === q.statement.trim()) err('statement is unchanged');
  if (!Array.isArray(t.nearMiss) || t.nearMiss.length !== 3) {
    err('needs exactly 3 nearMiss entries');
    return;
  }
  const seen = new Set([t.pattern]);
  for (const nm of t.nearMiss) {
    if (!patternIds.has(nm.p)) err(`unknown nearMiss ${nm.p}`);
    if (alternates.includes(nm.p)) err(`nearMiss ${nm.p} is also an accepted alternate`);
    if (seen.has(nm.p)) err(`nearMiss ${nm.p} duplicates the answer or another near-miss`);
    seen.add(nm.p);
    if (!nm.why) err(`nearMiss ${nm.p} needs a why`);
  }
  if (!t.nearMiss.some((nm) => nm.p === q.pattern)) err(`nearMiss must include the original pattern ${q.pattern}`);
}

export function validateBank({ patterns, families = [], problems }) {
  const errors = [];
  const warnings = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

  const patternIds = new Set();
  const orders = new Set();
  for (const p of patterns) {
    const w = `pattern ${p.id}`;
    if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) err(w, 'id must be kebab-case');
    if (patternIds.has(p.id)) err(w, 'duplicate id');
    patternIds.add(p.id);
    if (!p.name) err(w, 'missing name');
    if (typeof p.order !== 'number') err(w, 'missing numeric order');
    else if (orders.has(p.order)) err(w, `duplicate order ${p.order}`);
    orders.add(p.order);
    for (const f of ['group', 'template', 'javaDs', 'invariant']) if (!p[f]) err(w, `missing ${f}`);
    if (!Array.isArray(p.triggers) || p.triggers.length < 2) err(w, 'needs ≥2 triggers');
    if (!Array.isArray(p.aliases)) err(w, 'aliases must be an array');
    const l = p.lesson || {};
    for (const f of ['summary', 'javaSkeleton', 'complexity']) if (!l[f]) err(w, `lesson.${f} missing`);
    if (!Array.isArray(l.pitfalls) || l.pitfalls.length < 2) err(w, 'lesson needs ≥2 pitfalls');
    if (!Array.isArray(l.vs) || l.vs.length < 1) err(w, 'lesson needs ≥1 vs entry');
    if (!Array.isArray(p.resources) || p.resources.length < 2) err(w, 'needs ≥2 resources');
    for (const r of p.resources || []) {
      if (!r.title || !/^https:\/\//.test(r.url || '')) err(w, `bad resource ${JSON.stringify(r)}`);
      if (!KINDS.has(r.kind)) err(w, `resource kind must be article|video|reference (${r.url})`);
    }
  }
  for (const p of patterns) {
    for (const v of p.lesson?.vs || []) {
      if (!patternIds.has(v.pattern)) err(`pattern ${p.id}`, `lesson.vs refers to unknown pattern ${v.pattern}`);
    }
    if (p.parent && !patternIds.has(p.parent)) err(`pattern ${p.id}`, `unknown parent ${p.parent}`);
  }
  for (const f of families) {
    for (const m of f.members || []) if (!patternIds.has(m)) err(`family ${f.id}`, `unknown member ${m}`);
    for (const a of f.accept || []) if (!(f.members || []).includes(a)) err(`family ${f.id}`, `accept ${a} is not a member`);
  }

  const problemIds = new Set();
  let twists = 0;
  const perPattern = Object.fromEntries([...patternIds].map((id) => [id, 0]));
  for (const q of problems) {
    const w = `problem ${q.id}`;
    if (!q.id || !/^[a-z0-9-]+$/.test(q.id)) err(w, 'id must be kebab-case');
    if (problemIds.has(q.id)) err(w, 'duplicate id');
    problemIds.add(q.id);
    for (const f of ['title', 'slug', 'statement', 'approach']) if (!q[f]) err(w, `missing ${f}`);
    if (!DIFFICULTIES.has(q.difficulty)) err(w, 'difficulty must be Easy|Medium|Hard');
    if (!patternIds.has(q.pattern)) err(w, `unknown pattern ${q.pattern}`);
    else perPattern[q.pattern] += 1;
    const alternates = q.alternates || [];
    for (const a of alternates) if (!patternIds.has(a)) err(w, `unknown alternate ${a}`);

    if (!Array.isArray(q.nearMiss) || q.nearMiss.length !== 3) err(w, 'needs exactly 3 nearMiss entries');
    const seen = new Set([q.pattern]);
    for (const nm of q.nearMiss || []) {
      if (!patternIds.has(nm.p)) err(w, `unknown nearMiss ${nm.p}`);
      if (alternates.includes(nm.p)) err(w, `nearMiss ${nm.p} is also an accepted alternate`);
      if (seen.has(nm.p)) err(w, `nearMiss ${nm.p} duplicates the answer or another near-miss`);
      seen.add(nm.p);
      if (!nm.why) err(w, `nearMiss ${nm.p} needs a why`);
    }

    for (const key of PROBES) {
      const probe = q[key];
      if (!probe || !probe.answer || !Array.isArray(probe.wrong) || probe.wrong.length !== 3 || !probe.why) {
        err(w, `${key} needs answer, 3 wrong, why`);
        continue;
      }
      const labels = [probe.answer, ...probe.wrong.map(label)];
      if (labels.some((x) => !x)) err(w, `${key} has an empty option`);
      if (new Set(labels.map((x) => String(x).toLowerCase())).size !== 4) err(w, `${key} options are not distinct`);
    }
    if (q.trigger?.answer && !q.statement?.toLowerCase().includes(q.trigger.answer.toLowerCase())) {
      err(w, `trigger phrase "${q.trigger.answer}" is not in the statement`);
    }
    if (!q.whyNot || !Array.isArray(q.whyNot.wrong) || q.whyNot.wrong.length !== 3) err(w, 'whyNot needs 3 wrong');
    else if (q.nearMiss?.[0] && new Set([q.nearMiss[0].why, ...q.whyNot.wrong.map(label)]).size !== 4) {
      err(w, 'whyNot options are not distinct');
    }
    if (q.twists !== undefined) {
      if (Array.isArray(q.twists)) twists += q.twists.length;
      if (!Array.isArray(q.twists)) err(w, 'twists must be an array');
      else q.twists.forEach((t, i) => validateTwist(t, q, patternIds, (msg) => err(`${w} twist ${i + 1}`, msg)));
    }
  }
  // Every alias must classify back to its own pattern/family, otherwise L3
  // grading would mark the canonical answer wrong.
  const index = buildAliasIndex(patterns, families);
  for (const e of index) {
    const got = classify(e.alias, index);
    if (!got || got.kind !== e.target.kind || got.id !== e.target.id) {
      err(`alias "${e.alias}"`, `classifies to ${got ? got.id : 'nothing'} instead of ${e.target.id}`);
    }
  }

  for (const [id, n] of Object.entries(perPattern)) {
    if (n === 0) err(`pattern ${id}`, 'has no problems');
    else if (n < 2) warn(`pattern ${id}`, 'has only 1 problem (aim for ≥2)');
  }
  return { errors, warnings, counts: { patterns: patterns.length, problems: problems.length, twists } };
}
