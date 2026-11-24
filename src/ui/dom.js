// Minimal DOM helpers. All text goes through textContent or escape(), so
// question-bank content can never inject markup.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Escaped text with `backtick` spans rendered as <code>. */
export function rich(text, tag = 'span', cls) {
  const html = escape(text).replace(/`([^`]+)`/g, '<code>$1</code>');
  return h(tag, { class: cls, html });
}

/** Statement with an optional highlighted [start, end) range. */
export function statementEl(text, range) {
  if (!range) return h('p', { class: 'statement' }, text);
  const [a, b] = range;
  return h('p', { class: 'statement' }, text.slice(0, a), h('mark', {}, text.slice(a, b)), text.slice(b));
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/** Bottom sheet. Returns a close function. */
export function openSheet(title, body) {
  const root = document.getElementById('sheet');
  clear(root);
  const close = () => {
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sheet-open');
  };
  root.append(
    h('div', { class: 'sheet-backdrop', onclick: close }),
    h('div', { class: 'sheet-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-head' },
        h('h2', {}, title),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
      h('div', { class: 'sheet-body' }, body)),
  );
  root.classList.add('open');
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('sheet-open');
  root.querySelector('.sheet-body').scrollTop = 0;
  return close;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/** Replace root's content, skipping null/false children (native append would print "null"). */
export function render(root, ...children) {
  clear(root);
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    root.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return root;
}
