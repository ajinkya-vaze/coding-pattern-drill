// The question screen. Runs a queue of problems in either 'drill' mode
// (blocked: one pattern, L1 → L2 for every problem) or 'play' mode
// (interleaved: each problem at its own level).

import { h, render, statementEl, rich, toast, openSheet } from './dom.js';
import { lessonEl, problemDigEl } from './lesson.js';
import { buildRecognise, buildProbe, triggerRange } from '../engine/questions.js';
import { gradeRecall } from '../engine/grading.js';
import {
  getRecord, levelFor, recordRecognise, recordProbe, recordRecall, STAGE, INTERVALS,
  drillComplete, markLearned,
} from '../engine/scheduler.js';
import { leetcodeUrl } from '../engine/util.js';

const LEVEL_NAMES = { 1: 'L1 · Recognise', 2: 'L2 · Probe', 3: 'L3 · Recall' };
const STEP_NAMES = { trigger: 'Trigger', ds: 'Java DS', invariant: 'Invariant', time: 'Time', space: 'Space', whyNot: 'Why not?' };

export function runSession(root, ctx, { mode, queue, patternId = null }) {
  const { bank } = ctx;
  const results = [];
  let index = 0;

  const header = (problem, level) => h('div', { class: 'q-head' },
    h('div', { class: 'q-meta' },
      h('span', { class: 'chip' }, `${index + 1} / ${queue.length}`),
      h('span', { class: `chip chip-level l${level}` }, LEVEL_NAMES[level]),
      h('span', { class: `chip chip-diff ${problem.difficulty.toLowerCase()}` }, problem.difficulty)),
    h('button', { class: 'link-btn', onclick: () => finish(true) }, 'End'));

  const titleEl = (problem) => h('h2', { class: 'q-title' }, problem.title,
    problem.companies?.length ? h('span', { class: 'companies' }, problem.companies.join(' · ')) : null);

  function digDeeper(problem, { counts }) {
    if (counts) counts();
    const pattern = bank.patternsById[problem.pattern];
    openSheet(pattern.name, h('div', {}, problemDigEl(problem, pattern), lessonEl(pattern, bank.patternsById, { compact: true })));
  }

  function report(problem, where) {
    const ta = h('textarea', { rows: 4, placeholder: 'What looks wrong? (answer, wording, complexity…)' });
    const close = openSheet('Report this question', h('div', { class: 'stack' },
      h('p', { class: 'muted' }, `${problem.title} · ${where}`),
      ta,
      h('button', {
        class: 'btn primary',
        onclick: () => {
          ctx.state.reports.push({ id: problem.id, q: where, note: ta.value.trim(), at: Date.now() });
          ctx.save();
          close();
          toast('Saved. It travels with your progress code.');
        },
      }, 'Save report')));
    setTimeout(() => ta.focus(), 50);
  }

  function toolsRow(problem, where, { beforeAnswer } = {}) {
    return h('div', { class: 'tools' },
      h('button', { class: 'btn ghost', onclick: () => digDeeper(problem, { counts: beforeAnswer?.() }) }, 'Dig deeper'),
      h('button', { class: 'btn ghost', onclick: () => report(problem, where()) }, 'Report'));
  }

  function optionButtons(options, onPick) {
    const list = h('div', { class: 'options' });
    options.forEach((opt, i) => {
      list.append(h('button', {
        class: 'option',
        onclick: () => {
          for (const b of list.children) b.disabled = true;
          [...list.children].forEach((b, j) => {
            if (options[j].correct) b.classList.add('correct');
            else if (j === i) b.classList.add('wrong');
            else b.classList.add('dim');
          });
          onPick(opt, i);
        },
      }, rich(opt.label)));
    });
    return list;
  }

  function feedbackEl(correct, headline, lines) {
    return h('div', { class: `feedback ${correct ? 'good' : 'bad'}`, role: 'status' },
      h('p', { class: 'feedback-head' }, correct ? '✓ ' : '✗ ', headline),
      lines.filter(Boolean).map((l) => (l instanceof Node ? l : rich(l, 'p'))));
  }

  function nearMissLines(problem) {
    return problem.nearMiss.map((nm) => h('p', { class: 'why-row' },
      h('strong', {}, `Not ${bank.patternsById[nm.p].name}: `), rich(nm.why)));
  }

  // ---------- L1 ----------
  function renderRecognise(problem) {
    const q = buildRecognise(problem, bank.patternsById);
    let peeked = false;
    const area = h('div', { class: 'q-area' });
    const statement = statementEl(problem.statement);
    render(root, 
      header(problem, 1), titleEl(problem), statement,
      h('p', { class: 'q-prompt' }, q.title),
      area,
      toolsRow(problem, () => 'L1 pattern', { beforeAnswer: () => () => { if (!answered) { peeked = true; toast('Peeking counts as a hint: no promotion this time.'); } } }),
    );
    let answered = false;
    area.append(optionButtons(q.options, (opt) => {
      answered = true;
      recordRecognise(ctx.state, problem.id, { correct: opt.correct, peeked }, Date.now());
      ctx.save();
      const promoted = opt.correct && !peeked;
      const answerLabel = q.options.find((o) => o.correct).label;
      if (promoted) {
        // L2 asks for the trigger and the why-not next, so don't give them away here.
        area.append(feedbackEl(true, answerLabel, ['Now prove you know why: trigger, Java structure, invariant, cost, and why not the nearest alternative.']));
        area.append(h('button', { class: 'btn primary block', onclick: () => renderProbe(problem) }, 'Go deeper: L2 →'));
      } else {
        statement.replaceWith(statementEl(problem.statement, triggerRange(problem)));
        area.append(feedbackEl(opt.correct, opt.correct ? answerLabel : `It's ${answerLabel}`, [
          `Signal: “${problem.trigger.answer}”. ${problem.trigger.why}`,
          ...nearMissLines(problem),
        ]));
        results.push({ id: problem.id, level: 1, pass: false });
        area.append(nextButton());
      }
      area.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
  }

  // ---------- L2 ----------
  function renderProbe(problem) {
    const steps = buildProbe(problem, bank.patternsById);
    const pattern = bank.patternsById[problem.pattern];
    let step = 0;
    let allCorrect = true;
    const tally = [];

    const draw = () => {
      const s = steps[step];
      const area = h('div', { class: 'q-area' });
      window.scrollTo({ top: 0 });
      render(root, 
        header(problem, 2), titleEl(problem),
        statementEl(problem.statement, s.key === 'trigger' ? null : triggerRange(problem)),
        h('p', { class: 'known' }, 'Pattern: ', h('strong', {}, pattern.name)),
        h('div', { class: 'steps' }, steps.map((x, i) => h('span', {
          class: `step ${i < step ? (tally[i] ? 'ok' : 'miss') : i === step ? 'now' : ''}`,
        }, STEP_NAMES[x.key]))),
        h('p', { class: 'q-prompt' }, s.title),
        area,
        toolsRow(problem, () => `L2 ${s.key}`),
      );
      area.append(optionButtons(s.options, (opt) => {
        tally[step] = opt.correct;
        if (!opt.correct) allCorrect = false;
        const lines = [s.why];
        if (!opt.correct && opt.why) lines.push(h('p', { class: 'why-row' }, h('strong', {}, 'Your pick: '), rich(opt.why)));
        area.append(feedbackEl(opt.correct, opt.correct ? 'Right' : `Answer: ${s.options.find((o) => o.correct).label}`, lines));
        const last = step === steps.length - 1;
        area.append(h('button', {
          class: 'btn primary block',
          onclick: () => { if (last) summary(); else { step += 1; draw(); } },
        }, last ? 'Finish L2' : 'Next question →'));
        area.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }));
    };

    const summary = () => {
      recordProbe(ctx.state, problem.id, { allCorrect }, Date.now());
      ctx.save();
      results.push({ id: problem.id, level: 2, pass: allCorrect });
      const right = tally.filter(Boolean).length;
      render(root, 
        header(problem, 2), titleEl(problem),
        feedbackEl(allCorrect, allCorrect ? `All ${steps.length} right: L3 unlocked` : `${right} / ${steps.length}: stays at L2`, [
          allCorrect ? 'Next time you see this problem you will name the pattern with no options.' : 'Missed steps come back next time. Read the lesson for the ones you missed.',
          h('div', { class: 'steps' }, steps.map((x, i) => h('span', { class: `step ${tally[i] ? 'ok' : 'miss'}` }, STEP_NAMES[x.key]))),
        ]),
        h('div', { class: 'recap' },
          h('h3', {}, 'Approach'),
          rich(problem.approach, 'p'),
          h('h3', {}, 'Why not the near-misses'),
          nearMissLines(problem)),
        h('div', { class: 'tools' },
          h('button', { class: 'btn ghost', onclick: () => digDeeper(problem, {}) }, 'Dig deeper'),
          h('a', { class: 'btn ghost', href: leetcodeUrl(problem.slug), target: '_blank', rel: 'noopener noreferrer' }, 'LeetCode ↗')),
        nextButton(),
      );
    };
    draw();
  }

  // ---------- L3 ----------
  function renderRecall(problem) {
    const rec = getRecord(ctx.state, problem.id);
    const pattern = bank.patternsById[problem.pattern];
    let hints = 0;
    let peeked = false;
    let done = false;
    let statement = statementEl(problem.statement);
    const hintArea = h('div', { class: 'hint-area' });
    const area = h('div', { class: 'q-area' });
    const input = h('input', {
      type: 'text', class: 'answer-input', placeholder: 'Type the pattern…', autocomplete: 'off',
      autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Pattern name',
      onkeydown: (e) => { if (e.key === 'Enter') check(); },
    });
    const checkBtn = h('button', { class: 'btn primary', onclick: () => check() }, 'Check');
    const hintBtn = h('button', { class: 'btn ghost', onclick: () => nextHint() }, 'Hint 1 of 3');

    render(root, 
      header(problem, 3),
      rec.stage === STAGE.MASTERED ? h('p', { class: 'eyebrow' }, 'Spaced review') : null,
      titleEl(problem), statement,
      h('p', { class: 'q-prompt' }, 'Which pattern solves this? No options this time.'),
      area,
      toolsRow(problem, () => 'L3 recall', { beforeAnswer: () => () => { if (!done) { peeked = true; toast('Peeking counts as a hint.'); } } }),
    );
    area.append(h('div', { class: 'answer-row' }, input, checkBtn), h('div', { class: 'hint-row' }, hintBtn), hintArea);
    setTimeout(() => input.focus({ preventScroll: true }), 50);

    function nextHint() {
      hints += 1;
      if (hints === 1) {
        const fresh = statementEl(problem.statement, triggerRange(problem));
        statement.replaceWith(fresh);
        statement = fresh;
        hintArea.append(h('p', { class: 'hint' }, 'Hint 1: the highlighted phrase is the signal.'));
        hintBtn.textContent = 'Hint 2 of 3';
      } else if (hints === 2) {
        hintArea.append(rich(`Hint 2: the data structure is ${problem.ds.answer}.`, 'p', 'hint'));
        hintBtn.textContent = 'Hint 3 of 3: show options';
      } else {
        hintBtn.remove();
        input.closest('.answer-row').remove();
        const q = buildRecognise(problem, bank.patternsById);
        hintArea.append(h('p', { class: 'hint' }, 'Hint 3: pick from four.'));
        hintArea.append(optionButtons(q.options, (opt) => {
          done = true;
          recordRecall(ctx.state, problem.id, { correct: opt.correct, hinted: true }, Date.now());
          ctx.save();
          results.push({ id: problem.id, level: 3, pass: false });
          reveal(opt.correct ? 'correct-hinted' : 'wrong', null);
        }));
      }
    }

    function check() {
      if (done) return;
      done = true;
      const answer = input.value.trim();
      const hinted = hints > 0 || peeked;
      const g = answer ? gradeRecall(answer, problem, ctx.aliasIndex, bank.families, bank.patternsById) : { verdict: 'wrong', matched: null };
      input.disabled = true;
      checkBtn.disabled = true;
      hintBtn.disabled = true;
      if (g.verdict === 'correct') {
        recordRecall(ctx.state, problem.id, { correct: true, hinted }, Date.now());
        ctx.save();
        results.push({ id: problem.id, level: 3, pass: !hinted });
        reveal(hinted ? 'correct-hinted' : 'correct', g);
      } else {
        reveal(g.verdict, g, answer, hinted);
      }
    }

    function matchedName(g) {
      if (!g?.matched) return null;
      if (g.matched.kind === 'pattern') return bank.patternsById[g.matched.id]?.name;
      return bank.families.find((f) => f.id === g.matched.id)?.name;
    }

    function reveal(verdict, g, answer = '', hinted = false) {
      const fresh = statementEl(problem.statement, triggerRange(problem));
      statement.replaceWith(fresh);
      statement = fresh;
      const after = getRecord(ctx.state, problem.id);
      const lines = [
        `Signal: “${problem.trigger.answer}”. ${problem.trigger.why}`,
        h('p', {}, h('strong', {}, 'Approach: '), rich(problem.approach)),
      ];
      let head;
      if (verdict === 'correct') {
        head = after.stage === STAGE.MASTERED ? `${pattern.name}. Next review in ${INTERVALS[after.box]} day${INTERVALS[after.box] === 1 ? '' : 's'}.` : pattern.name;
      } else if (verdict === 'correct-hinted') {
        head = `${pattern.name}. Right, but with a hint: it stays at L3.`;
      } else if (verdict === 'family') {
        head = `Close: “${matchedName(g)}” is the broader idea. The specific pattern is ${pattern.name}.`;
      } else {
        head = answer ? `It's ${pattern.name}${matchedName(g) ? ` (you said ${matchedName(g)})` : ''}.` : `It's ${pattern.name}.`;
      }
      const good = verdict === 'correct' || verdict === 'correct-hinted';
      area.append(feedbackEl(good, head, lines));

      const pending = verdict === 'family' || verdict === 'wrong';
      if (pending && answer) {
        // Let him overrule the matcher; logged as an override.
        area.append(h('div', { class: 'tools' },
          h('button', {
            class: 'btn ghost',
            onclick: () => {
              recordRecall(ctx.state, problem.id, { correct: true, hinted, override: true }, Date.now());
              ctx.save();
              results.push({ id: problem.id, level: 3, pass: !hinted, override: true });
              toast('Counted as correct (logged as an override).');
              go();
            },
          }, 'I meant that'),
          h('button', {
            class: 'btn primary',
            onclick: () => { recordMiss(); go(); },
          }, 'Count as a miss →')));
      } else {
        if (pending) recordMiss();
        area.append(nextButton());
      }
      area.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function recordMiss() {
      recordRecall(ctx.state, problem.id, { correct: false }, Date.now());
      ctx.save();
      results.push({ id: problem.id, level: 3, pass: false });
    }
  }

  // ---------- flow ----------
  function nextButton() {
    return h('button', { class: 'btn primary block', onclick: go }, index + 1 < queue.length ? 'Next problem →' : 'Finish');
  }

  function go() {
    index += 1;
    if (index >= queue.length) finish(false);
    else show();
  }

  function show() {
    const problem = bank.problemsById[queue[index]];
    window.scrollTo({ top: 0 });
    if (mode === 'drill') return renderRecognise(problem);
    const level = levelFor(getRecord(ctx.state, problem.id));
    if (level === 1) renderRecognise(problem);
    else if (level === 2) renderProbe(problem);
    else renderRecall(problem);
  }

  function finish(early) {
    window.scrollTo({ top: 0 });
    const passes = results.filter((r) => r.pass).length;
    const body = [];
    if (mode === 'drill') {
      const probs = bank.problemsByPattern[patternId];
      const pattern = bank.patternsById[patternId];
      if (drillComplete(ctx.state, probs)) {
        const first = !ctx.state.patterns[patternId]?.learned;
        markLearned(ctx.state, patternId, Date.now());
        ctx.save();
        body.push(h('div', { class: 'feedback good' },
          h('p', { class: 'feedback-head' }, first ? `✓ ${pattern.name} learned` : `✓ ${pattern.name} revised`),
          h('p', {}, 'Its problems now appear in Play, mixed with other patterns, and come back at L3 with no options.')));
      } else {
        const left = probs.filter((p) => getRecord(ctx.state, p.id).stage < STAGE.RECALL).length;
        body.push(h('div', { class: 'feedback bad' },
          h('p', { class: 'feedback-head' }, `${left} problem${left === 1 ? '' : 's'} still below L3`),
          h('p', {}, 'Run the drill again: it only asks the ones you have not cleared yet.')));
      }
      body.push(h('div', { class: 'stack' },
        h('a', { class: 'btn primary block', href: `#/drill/${patternId}` }, 'Drill again'),
        h('a', { class: 'btn block', href: '#/learn' }, 'Back to Learn'),
        h('a', { class: 'btn block', href: '#/play' }, 'Play mixed session')));
    } else {
      body.push(h('div', { class: 'stack' },
        h('a', { class: 'btn primary block', href: '#/play' }, 'Another session'),
        h('a', { class: 'btn block', href: '#/progress' }, 'See progress'),
        h('a', { class: 'btn block', href: '#/' }, 'Home')));
    }
    render(root, 
      h('h2', {}, early ? 'Session ended' : 'Session complete'),
      h('p', { class: 'big-stat' }, `${passes} / ${results.length}`, h('span', { class: 'muted' }, ' clean passes')),
      h('ul', { class: 'result-list' }, results.map((r) => h('li', {},
        h('span', { class: r.pass ? 'ok' : 'miss' }, r.pass ? '✓' : '✗'), ' ',
        bank.problemsById[r.id].title, h('span', { class: 'muted' }, ` · L${r.level}${r.override ? ' (override)' : ''}`)))),
      body,
    );
  }

  if (!queue.length) {
    render(root, h('p', {}, 'Nothing to ask right now.'), h('a', { class: 'btn block', href: '#/' }, 'Home'));
    return;
  }
  show();
}
