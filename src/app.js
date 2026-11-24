// Entry point: loads the bank and progress, then routes by location.hash.

import { loadBank, browserReadJson } from './engine/bank.js';
import { loadState, saveState } from './engine/storage.js';
import { buildAliasIndex } from './engine/grading.js';
import { buildSession } from './engine/scheduler.js';
import { h, render } from './ui/dom.js';
import { runSession } from './ui/quiz.js';
import { renderHome, renderLearnList, renderLesson, renderProgress, renderSync, drillQueue, handleImportLink } from './ui/screens.js';

const root = document.getElementById('app');

async function start() {
  let bank;
  try {
    bank = await loadBank(browserReadJson);
  } catch (e) {
    render(root, h('p', {}, 'Could not load the question bank. Check your connection and reload.'), h('pre', { class: 'small' }, String(e.message)));
    return;
  }

  const ctx = {
    bank,
    state: loadState(),
    aliasIndex: buildAliasIndex(bank.patterns, bank.families),
    save() { saveState(ctx.state); },
    replaceState(next) { ctx.state = next; saveState(next); },
    navigate(hash) { if (location.hash === hash) route(); else location.hash = hash; },
  };

  function setNav(active) {
    for (const a of document.querySelectorAll('.nav a')) a.classList.toggle('active', a.dataset.nav === active);
  }

  async function route() {
    const hash = location.hash || '#/';
    if (hash.startsWith('#import=')) {
      await handleImportLink(ctx, decodeURIComponent(hash.slice('#import='.length)));
      history.replaceState(null, '', location.pathname);
      return route();
    }
    const [, section, arg] = hash.replace(/^#\/?/, '/').split('/');
    window.scrollTo({ top: 0 });
    switch (section) {
      case 'learn':
        setNav('learn');
        return arg ? renderLesson(root, ctx, arg) : renderLearnList(root, ctx);
      case 'drill':
        setNav('learn');
        return runSession(root, ctx, { mode: 'drill', patternId: arg, queue: drillQueue(ctx, arg) });
      case 'play': {
        setNav('play');
        const queue = buildSession(ctx.state, bank.problems, {
          size: ctx.state.settings.sessionSize,
          includeUnlearned: ctx.state.settings.includeUnlearned,
        });
        if (!queue.length) {
          render(root, 
            h('h1', {}, 'Play'),
            h('p', {}, 'Nothing to play yet. Play mixes problems from patterns you have learned.'),
            h('a', { class: 'btn primary block', href: '#/learn' }, 'Learn a pattern'),
            h('a', { class: 'btn block', href: '#/sync' }, 'Or allow unlearned patterns in Settings'));
          return undefined;
        }
        return runSession(root, ctx, { mode: 'play', queue });
      }
      case 'progress':
        setNav('progress');
        return renderProgress(root, ctx);
      case 'sync':
        setNav('sync');
        return renderSync(root, ctx);
      default:
        setNav('home');
        return renderHome(root, ctx);
    }
  }

  window.addEventListener('hashchange', route);
  route();
}

start();

// Offline support on the deployed site (or locally with ?sw for testing).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || new URLSearchParams(location.search).has('sw'))) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
