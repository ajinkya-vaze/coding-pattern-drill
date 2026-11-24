// CI entry point: runs the engine tests and validates the question bank.
// Usage: node tools/run-tests.mjs   (exits non-zero on any failure)

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { run } from '../test/harness.js';
import '../test/engine.test.js';
import { loadBank } from '../src/engine/bank.js';
import { validateBank } from '../src/engine/validate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8'));

const results = await run();
for (const r of results) console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}${r.error ? ` — ${r.error}` : ''}`);
const failed = results.filter((r) => !r.pass).length;

const bank = await loadBank(readJson);
const v = validateBank(bank);
console.log(`\nbank: ${v.counts.patterns} patterns, ${v.counts.problems} problems`);
for (const e of v.errors) console.log(`ERROR ${e}`);
for (const w of v.warnings) console.log(`warn  ${w}`);

console.log(`\n${results.length - failed}/${results.length} tests pass, ${v.errors.length} bank errors`);
process.exit(failed || v.errors.length ? 1 : 0);
