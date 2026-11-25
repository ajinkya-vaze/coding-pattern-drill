// Home, Learn list, Lesson, Progress and Sync/Settings screens.

import { h, render, toast, copyText } from './dom.js';
import { lessonEl } from './lesson.js';
import {
  getRecord, patternStatus, STAGE, dueCount, recentAccuracy, isLearned, emptyState, buildSession,
  drillQueue as drillOrder,
} from '../engine/scheduler.js';
import { encodeProgress, decodeProgress, mergeProgress } from '../engine/progressCode.js';
import { epochDay } from '../engine/util.js';

const STATUS_LABEL = { new: 'New', learning: 'Learning', learned: 'Learned', mastered: 'Mastered' };

function stageCounts(ctx, patternId) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const p of ctx.bank.problemsByPattern[patternId] || []) counts[getRecord(ctx.state, p.id).stage] += 1;
  return counts;
}

function stageBar(counts, total) {
  return h('div', { class: 'stagebar', role: 'img', 'aria-label': `L1 ${counts[1]}, L2 ${counts[2]}, L3 ${counts[3]}, mastered ${counts[4]}` },
    [1, 2, 3, 4].map((s) => (counts[s] ? h('span', { class: `seg s${s}`, style: `flex:${counts[s] / total}` }) : null)));
}

function nextPatternToLearn(ctx) {
  return ctx.bank.patterns.find((p) => !isLearned(ctx.state, p.id) && (ctx.bank.problemsByPattern[p.id] || []).length);
}

export function exportAgeDays(state) {
  if (!state.lastExport) return null;
  return epochDay() - epochDay(state.lastExport);
}

function nextSub(ctx, patternId) {
  const d = drillProgress(ctx, patternId);
  return d.started ? `Drill in progress · ${d.cleared} of ${d.total} cleared` : `${d.total} problems · lesson + blocked drill`;
}

// ---------- Home ----------
export function renderHome(root, ctx) {
  const { bank, state } = ctx;
  const learned = bank.patterns.filter((p) => isLearned(state, p.id)).length;
  const mastered = bank.problems.filter((p) => getRecord(state, p.id).stage === STAGE.MASTERED).length;
  const due = dueCount(state, bank.problems);
  const next = nextPatternToLearn(ctx);
  const touched = Object.keys(state.problems).length;
  const age = exportAgeDays(state);
  const playable = buildSession(state, bank.problems, { size: 1, includeUnlearned: state.settings.includeUnlearned }).length > 0;

  render(root, 
    h('section', { class: 'hero' },
      h('h1', {}, 'Pattern Drill'),
      h('p', { class: 'muted' }, 'Read a real interview problem. Name the pattern, the structure, the invariant and the cost, until it is instant.')),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('span', { class: 'stat-num' }, `${learned}/${bank.patterns.length}`), h('span', { class: 'stat-label' }, 'patterns learned')),
      h('div', { class: 'stat' }, h('span', { class: 'stat-num' }, `${mastered}/${bank.problems.length}`), h('span', { class: 'stat-label' }, 'problems mastered')),
      h('div', { class: 'stat' }, h('span', { class: 'stat-num' }, String(due)), h('span', { class: 'stat-label' }, 'reviews due'))),
    touched && (age === null || age >= 5)
      ? h('a', { class: 'banner', href: '#/sync' }, age === null ? 'Progress lives only in this browser. Copy a progress code to back it up →' : `Last progress code copied ${age} days ago. Copy a fresh one →`)
      : null,
    h('div', { class: 'stack' },
      next ? h('a', { class: 'card-link primary', href: `#/learn/${next.id}` },
        h('span', { class: 'card-kicker' }, 'Learn next'),
        h('span', { class: 'card-title' }, next.name),
        h('span', { class: 'card-sub' }, nextSub(ctx, next.id))) : null,
      h('a', { class: `card-link${playable ? '' : ' disabled'}`, href: playable ? '#/play' : '#/learn' },
        h('span', { class: 'card-kicker' }, 'Play'),
        h('span', { class: 'card-title' }, due ? `Mixed session · ${due} due` : 'Mixed session'),
        h('span', { class: 'card-sub' }, playable ? 'Interleaved across the patterns you have learned' : 'Learn a pattern first (or allow unlearned patterns in Settings)')),
      h('a', { class: 'card-link', href: '#/learn' },
        h('span', { class: 'card-kicker' }, 'Learn'),
        h('span', { class: 'card-title' }, 'All patterns'),
        h('span', { class: 'card-sub' }, 'Lesson cards, triggers, Java skeletons, near-miss comparisons'))),
  );
}

// ---------- Learn list ----------
export function renderLearnList(root, ctx) {
  const { bank, state } = ctx;
  const groups = [];
  for (const p of bank.patterns) {
    let g = groups.find((x) => x.name === p.group);
    if (!g) groups.push((g = { name: p.group, items: [] }));
    g.items.push(p);
  }
  render(root, 
    h('h1', {}, 'Learn'),
    h('p', { class: 'muted' }, 'Work top to bottom. Each pattern: read the card, then a blocked drill (L1 + L2 on every problem). Finishing the drill adds it to Play.'),
    groups.map((g) => h('section', { class: 'group' },
      h('h2', { class: 'group-title' }, g.name),
      h('ul', { class: 'pattern-list' }, g.items.map((p) => {
        const probs = bank.problemsByPattern[p.id] || [];
        const status = patternStatus(state, p.id, probs);
        return h('li', {},
          h('a', { href: `#/learn/${p.id}`, class: 'pattern-row' },
            h('span', { class: 'pattern-order' }, String(p.order)),
            h('span', { class: 'pattern-name' }, p.name, h('span', { class: 'muted small' }, ` · ${probs.length}`)),
            h('span', { class: `chip status ${status}` }, STATUS_LABEL[status])));
      })))),
  );
}

function drillCta(ctx, patternId) {
  const d = drillProgress(ctx, patternId);
  if (d.cleared === d.total) return 'Drill again';
  if (d.started) return `Resume the drill · ${d.cleared} of ${d.total} cleared`;
  return 'Start the drill';
}

// ---------- Lesson ----------
export function renderLesson(root, ctx, patternId) {
  const { bank, state } = ctx;
  const pattern = bank.patternsById[patternId];
  if (!pattern) return renderLearnList(root, ctx);
  const probs = bank.problemsByPattern[patternId] || [];
  const status = patternStatus(state, patternId, probs);
  render(root, 
    h('a', { class: 'back', href: '#/learn' }, '← All patterns'),
    h('h1', {}, pattern.name),
    h('p', {}, h('span', { class: `chip status ${status}` }, STATUS_LABEL[status]), ' ', h('span', { class: 'muted' }, `${probs.length} problems in the drill`)),
    lessonEl(pattern, bank.patternsById),
    h('section', {},
      h('h3', {}, 'Problems in this drill'),
      h('ul', { class: 'plain' }, probs.map((p) => h('li', {}, p.title,
        h('span', { class: 'muted small' }, ` · ${p.difficulty}${STAGE_MARK[getRecord(state, p.id).stage]}`))))),
    probs.length
      ? h('a', { class: 'btn primary block sticky-cta', href: `#/drill/${patternId}` }, drillCta(ctx, patternId))
      : h('p', { class: 'muted' }, 'No problems for this pattern yet.'),
  );
}

export function drillQueue(ctx, patternId) {
  const queue = drillOrder(ctx.state, patternId, ctx.bank.problemsByPattern[patternId] || []);
  ctx.save();
  return queue;
}

/** How far a pattern's drill has got: problems at L3+ and problems part-way (L1 passed). */
function drillProgress(ctx, patternId) {
  const probs = ctx.bank.problemsByPattern[patternId] || [];
  const stages = probs.map((p) => getRecord(ctx.state, p.id).stage);
  return {
    total: probs.length,
    cleared: stages.filter((st) => st >= STAGE.RECALL).length,
    started: stages.some((st) => st > STAGE.RECOGNISE),
  };
}

const STAGE_MARK = { 1: '', 2: ' · L1 passed', 3: ' · cleared', 4: ' · mastered' };

// ---------- Progress ----------
export function renderProgress(root, ctx) {
  const { bank, state } = ctx;
  const rows = bank.patterns.map((p) => {
    const probs = bank.problemsByPattern[p.id] || [];
    const accs = probs.map((q) => recentAccuracy(getRecord(state, q.id))).filter((a) => a !== null);
    const acc = accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : null;
    return { p, probs, acc, status: patternStatus(state, p.id, probs), counts: stageCounts(ctx, p.id) };
  });
  const weak = rows.filter((r) => r.acc !== null && isLearned(state, r.p.id)).sort((a, b) => a.acc - b.acc).slice(0, 5);
  const overrides = Object.values(state.problems).reduce((n, r) => n + (r.overrides || 0), 0);
  const slow = Object.values(state.problems).reduce((n, r) => n + (r.slow || 0), 0);

  const rowEl = (r) => h('li', { class: 'progress-row' },
    h('a', { href: `#/learn/${r.p.id}` },
      h('div', { class: 'progress-top' },
        h('span', {}, r.p.name),
        h('span', { class: `chip status ${r.status}` }, STATUS_LABEL[r.status])),
      r.probs.length ? stageBar(r.counts, r.probs.length) : null,
      h('div', { class: 'muted small' },
        `L1 ${r.counts[1]} · L2 ${r.counts[2]} · L3 ${r.counts[3]} · mastered ${r.counts[4]}`,
        r.acc !== null ? ` · recent ${Math.round(r.acc * 100)}%` : '')));

  render(root, 
    h('h1', {}, 'Progress'),
    h('div', { class: 'legend' },
      h('span', {}, h('i', { class: 'seg s1' }), 'L1'), h('span', {}, h('i', { class: 'seg s2' }), 'L2'),
      h('span', {}, h('i', { class: 'seg s3' }), 'L3'), h('span', {}, h('i', { class: 'seg s4' }), 'Mastered')),
    weak.length ? h('section', {}, h('h2', {}, 'Needs attention'), h('ul', { class: 'progress-list' }, weak.map(rowEl))) : null,
    overrides ? h('p', { class: 'muted small' }, `“I meant that” overrides used: ${overrides}. Keep these honest.`) : null,
    slow ? h('p', { class: 'muted small' }, `Slow answers (timer ran out): ${slow}.`) : null,
    h('section', {}, h('h2', {}, 'All patterns'), h('ul', { class: 'progress-list' }, rows.map(rowEl))),
  );
}

// ---------- Sync & settings ----------
export function renderSync(root, ctx) {
  const { state } = ctx;
  const codeBox = h('textarea', { rows: 4, readonly: true, class: 'mono', placeholder: 'Your code appears here after “Copy code”.' });
  const pasteBox = h('textarea', { rows: 4, class: 'mono', placeholder: 'Paste a PD1.… code here' });
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden', onchange: (e) => importFile(e.target.files[0]) });
  const age = exportAgeDays(state);

  async function makeCode() {
    const code = await encodeProgress(state);
    codeBox.value = code;
    return code;
  }
  function markExported() {
    state.lastExport = Date.now();
    ctx.save();
  }
  async function doMerge(payload) {
    const { state: merged, summary } = mergeProgress(state, payload);
    ctx.replaceState({ ...merged, settings: state.settings, lastExport: state.lastExport });
    toast(`Merged: ${summary.problems} problems, ${summary.patterns} patterns, ${summary.reports} reports updated.`);
    ctx.navigate('#/');
  }
  async function importFile(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await doMerge({ problems: data.problems || {}, patterns: data.patterns || {}, reports: data.reports || [] });
    } catch {
      toast('That file is not a Pattern Drill progress file.');
    }
  }

  const settings = state.settings;
  const unlearned = h('input', { type: 'checkbox', id: 'opt-unlearned', checked: settings.includeUnlearned || null,
    onchange: (e) => { settings.includeUnlearned = e.target.checked; ctx.save(); } });
  const timer = h('input', { type: 'checkbox', id: 'opt-timer', checked: settings.timer || null,
    onchange: (e) => { settings.timer = e.target.checked; ctx.save(); } });
  const size = h('select', { id: 'opt-size', onchange: (e) => { settings.sessionSize = Number(e.target.value); ctx.save(); } },
    [5, 10, 15, 20].map((n) => h('option', { value: n, selected: settings.sessionSize === n || null }, `${n} problems`)));

  render(root, 
    h('h1', {}, 'Sync & settings'),
    h('section', { class: 'panel' },
      h('h2', {}, 'Move progress between devices'),
      h('p', { class: 'muted' }, 'Progress is saved in this browser only. A progress code carries it to another device. Importing merges: for each problem the newer record wins, so an old code never wipes newer progress.'),
      age !== null ? h('p', { class: 'small muted' }, `Last copied ${age === 0 ? 'today' : `${age} days ago`}.`) : null,
      codeBox,
      h('div', { class: 'tools' },
        h('button', { class: 'btn primary', onclick: async () => { const c = await makeCode(); if (await copyText(c)) { markExported(); toast('Progress code copied.'); } else toast('Copy failed: select the text and copy it.'); } }, 'Copy code'),
        h('button', { class: 'btn', onclick: async () => {
          const c = await makeCode();
          const url = `${location.origin}${location.pathname}#import=${c}`;
          if (navigator.share) {
            try { await navigator.share({ title: 'Pattern Drill progress', url }); markExported(); } catch { /* cancelled */ }
          } else if (await copyText(url)) { markExported(); toast('Link copied. Open it on the other device.'); }
        } }, 'Share link'),
        h('button', { class: 'btn', onclick: () => {
          const blob = new Blob([JSON.stringify({ v: 1, problems: state.problems, patterns: state.patterns, reports: state.reports }, null, 1)], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: `pattern-drill-progress-${new Date().toISOString().slice(0, 10)}.json` });
          document.body.append(a); a.click(); a.remove();
          markExported();
        } }, 'Download file')),
      h('h3', {}, 'Bring progress in'),
      pasteBox,
      h('div', { class: 'tools' },
        h('button', { class: 'btn primary', onclick: async () => {
          try { await doMerge(await decodeProgress(pasteBox.value)); } catch (e) { toast(e.message); }
        } }, 'Merge code'),
        h('label', { class: 'btn', for: 'file-in' }, 'Upload file'),
        Object.assign(fileInput, { id: 'file-in' }))),
    h('section', { class: 'panel' },
      h('h2', {}, 'Play settings'),
      h('label', { class: 'toggle', for: 'opt-unlearned' }, unlearned, h('span', {}, 'Include patterns I have not learned yet (cold self-test)')),
      h('label', { class: 'toggle', for: 'opt-timer' }, timer, h('span', {}, '60-second timer at L3 recall and L4 twists. Running out logs a slow attempt; the answer still counts.')),
      h('label', { class: 'field', for: 'opt-size' }, h('span', {}, 'Session length'), size)),
    h('section', { class: 'panel' },
      h('h2', {}, `Reported questions (${state.reports.length})`),
      state.reports.length
        ? h('div', {},
          h('ul', { class: 'plain small' }, state.reports.slice(-20).reverse().map((r) => h('li', {}, `${ctx.bank.problemsById[r.id]?.title || r.id} · ${r.q}: ${r.note || '(no note)'}`))),
          h('button', { class: 'btn', onclick: async () => { if (await copyText(JSON.stringify(state.reports, null, 1))) toast('Reports copied.'); } }, 'Copy reports'))
        : h('p', { class: 'muted small' }, 'Use “Report” on any question that looks wrong. Reports are included in your progress code.')),
    h('section', { class: 'panel danger' },
      h('h2', {}, 'Reset'),
      h('button', { class: 'btn danger', onclick: () => {
        if (confirm('Erase all progress in this browser? Copy a progress code first if you might want it back.')) {
          ctx.replaceState({ ...emptyState(), settings: state.settings });
          toast('Progress erased.');
          ctx.navigate('#/');
        }
      } }, 'Erase progress on this device')),
  );
}

/** Handle #import=PD1.… links: confirm, then merge. */
export async function handleImportLink(ctx, code) {
  let payload;
  try {
    payload = await decodeProgress(code);
  } catch (e) {
    toast(e.message);
    return;
  }
  const n = Object.keys(payload.problems).length;
  if (confirm(`Merge progress for ${n} problems from this link into this device? Newer records win; nothing newer is lost.`)) {
    const { state: merged, summary } = mergeProgress(ctx.state, payload);
    ctx.replaceState({ ...merged, settings: ctx.state.settings, lastExport: ctx.state.lastExport });
    toast(`Merged: ${summary.problems} problems updated.`);
  }
}

