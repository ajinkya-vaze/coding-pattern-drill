// Pattern lesson card. Used by Learn mode and by the Dig-deeper sheet.

import { h, rich } from './dom.js';
import { leetcodeUrl } from '../engine/util.js';

const KIND_LABEL = { article: 'Article', video: 'Video', reference: 'Reference' };

export function resourcesEl(resources) {
  return h('ul', { class: 'resources' },
    resources.map((r) => h('li', {},
      h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.title),
      h('span', { class: 'chip chip-muted' }, KIND_LABEL[r.kind] || r.kind))));
}

export function lessonEl(pattern, patternsById, { compact = false } = {}) {
  const l = pattern.lesson;
  return h('div', { class: 'lesson' },
    compact ? null : h('p', { class: 'eyebrow' }, pattern.group),
    h('section', {},
      h('h3', {}, 'Learn more'),
      resourcesEl(pattern.resources)),
    h('section', {},
      h('h3', {}, 'What it is'),
      rich(l.summary, 'p')),
    h('section', {},
      h('h3', {}, 'Spot it when you see'),
      h('ul', {}, pattern.triggers.map((t) => rich(t, 'li')))),
    h('section', {},
      h('h3', {}, 'Template'),
      rich(pattern.template, 'p', 'callout')),
    h('section', {},
      h('h3', {}, 'Java skeleton'),
      h('pre', { class: 'code' }, h('code', {}, l.javaSkeleton)),
      h('p', { class: 'muted small' }, 'Typical structures: ', pattern.javaDs)),
    h('section', {},
      h('h3', {}, 'Invariant'),
      rich(pattern.invariant, 'p', 'callout callout-accent')),
    h('section', {},
      h('h3', {}, 'Complexity'),
      rich(l.complexity, 'p')),
    h('section', {},
      h('h3', {}, 'Pitfalls'),
      h('ul', {}, l.pitfalls.map((t) => rich(t, 'li')))),
    h('section', {},
      h('h3', {}, 'Versus the near-misses'),
      h('div', { class: 'vs-list' },
        l.vs.map((v) => h('div', { class: 'vs-row' },
          h('div', { class: 'vs-name' }, `vs ${patternsById[v.pattern]?.name || v.pattern}`),
          rich(v.difference, 'div', 'vs-diff'))))),
  );
}

/** Problem-specific block shown above the lesson in the Dig-deeper sheet. */
export function problemDigEl(problem, pattern) {
  return h('div', { class: 'dig-problem' },
    h('p', { class: 'eyebrow' }, 'This problem'),
    h('p', {}, h('strong', {}, problem.title), ' · ', pattern.name),
    rich(problem.approach, 'p'),
    h('p', {}, h('a', { href: leetcodeUrl(problem.slug), target: '_blank', rel: 'noopener noreferrer' }, 'Open on LeetCode ↗')),
  );
}
