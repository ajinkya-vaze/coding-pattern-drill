// Turns a problem record into concrete questions with shuffled options.
// Option shape: { label, correct, why? }.

import { shuffle } from './util.js';

function optionOf(item, correct) {
  if (typeof item === 'string') return { label: item, correct };
  return { label: item.t, correct, why: item.why };
}

function probeOptions(probe, rng) {
  return shuffle([optionOf(probe.answer, true), ...probe.wrong.map((w) => optionOf(w, false))], rng);
}

/** L1: pick the pattern. Distractors are the problem's near-miss patterns. */
export function buildRecognise(problem, patternsById, rng = Math.random) {
  const correct = patternsById[problem.pattern];
  const options = [
    { label: correct.name, id: correct.id, correct: true },
    ...problem.nearMiss.slice(0, 3).map((nm) => ({
      label: patternsById[nm.p].name,
      id: nm.p,
      correct: false,
      why: nm.why,
    })),
  ];
  return {
    key: 'pattern',
    title: 'Which pattern solves this?',
    options: shuffle(options, rng),
    why: problem.trigger.why,
  };
}

export const PROBE_STEPS = ['trigger', 'ds', 'invariant', 'time', 'space', 'whyNot'];

export const PROBE_TITLES = {
  trigger: 'Which phrase is the strongest signal for this pattern?',
  ds: 'Which Java data structure(s) would you reach for?',
  invariant: 'Which invariant does the solution maintain?',
  time: 'Time complexity of the optimal solution?',
  space: 'Extra space complexity?',
};

/** L2: the probe chain, in a fixed order. */
export function buildProbe(problem, patternsById, rng = Math.random) {
  const steps = [];
  for (const key of PROBE_STEPS) {
    if (key === 'whyNot') {
      const nm = problem.nearMiss[0];
      steps.push({
        key,
        title: `Why isn't ${patternsById[nm.p].name} the right pattern here?`,
        options: shuffle([{ label: nm.why, correct: true }, ...problem.whyNot.wrong.map((w) => optionOf(w, false))], rng),
        why: nm.why,
      });
      continue;
    }
    const probe = problem[key];
    steps.push({ key, title: PROBE_TITLES[key], options: probeOptions(probe, rng), why: probe.why });
  }
  return steps;
}

/** Character range of the trigger phrase inside the statement (for highlighting). */
export function triggerRange(problem) {
  const idx = problem.statement.toLowerCase().indexOf(problem.trigger.answer.toLowerCase());
  return idx === -1 ? null : [idx, idx + problem.trigger.answer.length];
}
