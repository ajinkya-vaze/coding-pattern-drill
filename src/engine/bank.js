// Loads the question bank. `readJson(path)` is injected so the same code runs
// in the browser (fetch) and in Node (fs) for CI validation.

export async function loadBank(readJson) {
  const taxonomy = await readJson('data/patterns.json');
  const index = await readJson('data/index.json');
  const files = await Promise.all(index.problemFiles.map((f) => readJson(`data/problems/${f}`)));
  const problems = files.flat();
  const patterns = taxonomy.patterns.slice().sort((a, b) => a.order - b.order);
  const patternsById = Object.fromEntries(patterns.map((p) => [p.id, p]));
  const problemsByPattern = Object.fromEntries(patterns.map((p) => [p.id, []]));
  for (const q of problems) (problemsByPattern[q.pattern] ||= []).push(q);
  return {
    patterns,
    families: taxonomy.families || [],
    problems,
    patternsById,
    problemsById: Object.fromEntries(problems.map((q) => [q.id, q])),
    problemsByPattern,
  };
}

export function browserReadJson(path) {
  return fetch(path, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  });
}
