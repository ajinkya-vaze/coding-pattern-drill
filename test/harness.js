// A tiny test runner that works both in the browser (test.html) and in Node
// (tools/run-tests.mjs), so the suite runs without installing anything.

const cases = [];

export function test(name, fn) {
  cases.push({ name, fn });
}

export function ok(value, message = 'expected truthy') {
  if (!value) throw new Error(message);
}

export function eq(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message} expected ${e}, got ${a}`.trim());
}

export async function rejects(fn, pattern) {
  try {
    await fn();
  } catch (e) {
    if (pattern && !pattern.test(e.message)) throw new Error(`wrong error: ${e.message}`);
    return;
  }
  throw new Error('expected a rejection');
}

export async function run() {
  const results = [];
  for (const c of cases) {
    try {
      await c.fn();
      results.push({ name: c.name, pass: true });
    } catch (e) {
      results.push({ name: c.name, pass: false, error: e.message });
    }
  }
  return results;
}
