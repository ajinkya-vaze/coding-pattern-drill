# Pattern Drill

A phone-friendly drill for coding interviews. You read a real interview problem and name the
pattern that solves it. Then you name the trigger phrase, the Java data structure, the invariant,
the time and space cost, and why the closest wrong pattern fails. The aim is that a problem
statement tells you the solution shape at a glance.

It is a static site with no build step and no accounts, and it works offline once loaded.

## How it works

**Learn mode (blocked).** The 36 patterns come in a set curriculum order, from hashing up to
expand-around-centre. Each pattern has a lesson card:
- what the pattern is and its trigger phrases
- a Java skeleton
- its invariant, its complexity and common pitfalls
- a table comparing it with its near-miss patterns
- 2–3 checked external links

After the card, a drill asks every problem for that pattern at L1 and L2. Passing all of them
marks the pattern **Learned**. You can leave a drill at any point: it resumes on the same
problem, at the level and L2 step you reached, and the lesson page shows how many problems are
cleared.

**Play mode (interleaved).** Play mixes problems from all the patterns you have learned. Each
problem climbs its own ladder:

| Level | Question | Pass |
|---|---|---|
| L1 Recognise | Pattern, from 4 options (the wrong ones are near-miss patterns) | Unlocks L2 |
| L2 Probe | Trigger phrase → Java DS → invariant → time → space → "why not the nearest alternative?" | All 6 right unlocks L3 |
| L3 Recall | Type the pattern, with no options. Optional hints: highlight the trigger, show the DS, show 4 options | A clean pass marks the problem Mastered |
| L4 Twist | Same problem with one constraint changed so the pattern changes (e.g. Two Sum on sorted input → two pointers). Same screen and hints as L3 | A clean pass climbs a review box |

Mastered problems come back for review after 1, 3, 7, 16 and 35 days. A miss drops the problem
back to L2. A pattern counts as **Mastered** once at least 2 of its problems are mastered on
different days.

**L4 twists.** For a Mastered problem that has twists, reviews alternate: L3 (the problem
itself), then L4 (its next twist), then L3 again, cycling through its twists. A missed twist
keeps the problem Mastered but resets its review box, so the same twist comes back the next day.
In the 4-option hint, one of the options is always the original pattern: that's the trap.

**Timer (optional).** Turn on the 60-second timer under Sync → Play settings (off by default).
It runs at L3 and L4. Running out doesn't fail the answer: it is still graded, logged as a slow
attempt and counted on the Progress screen.

**Dig deeper** on any question opens the pattern's lesson and the problem's approach. Opening it
before you answer at L1/L3 counts as using a hint.

**L3 grading.** A typed answer is matched to the closest pattern alias, and typos are tolerated.
A broader answer, such as "stack" for a monotonic-stack problem or "binary search" for binary
search on the answer, is marked *close*, not correct. Use **I meant that** to overrule the
matcher. Overrides are counted on the Progress screen.

## Moving progress between devices

Progress lives in the browser's `localStorage`. On **Sync**, there are four ways to move it:
- **Copy code** gives a `PD1.…` text block (deflate + base64url, a few KB). Paste it on the
  other device.
- **Share link** makes `…/#import=PD1.…`. The `#` part is never sent to the server, and the page
  asks before merging.
- **Download file** saves the same data as a JSON file.
- **Upload file** loads one of those JSON files.

Importing **merges**: for each problem the newer record wins, so an old code never wipes newer
progress. "Report this question" notes travel inside the code too.

## Question bank

- `data/patterns.json` holds the 36 patterns (aliases, triggers, lesson, resources) plus generic
  answer families such as "dfs" and "dp".
- `data/problems/*.json` holds the problems, with one file per curriculum group listed in
  `data/index.json`.
- Statements are **paraphrased**, keeping only the constraints that decide the pattern. Every
  problem links to LeetCode for the full text.
- **Company tags** mean the problem appeared in that company's top 20 by frequency, over a
  six-month window, in the community-maintained
  [leetcode-company-wise-problems](https://github.com/liquidslr/leetcode-company-wise-problems)
  snapshot (Oct 2026). Problems without tags come from standard lists (NeetCode 150 / Grind 75)
  to cover every pattern. Treat the tags as a rough signal, not ground truth.

### Adding a problem

Copy an existing entry. Every L2 probe needs `answer`, exactly 3 `wrong` options and a `why`. A
wrong option can be `{ "t": "...", "why": "..." }` so it explains itself when picked. Other rules:
- `trigger.answer` must appear word for word in `statement`, because it gets highlighted.
- `nearMiss` must list exactly 3 patterns with a reason each. The first one is used for the
  "why not?" question.
- `alternates` lists other valid patterns. These are accepted at L3 and never shown as wrong
  options.
- `twists` (optional) lists L4 variants. Each twist needs `change` (one line saying what
  changed), a full `statement`, `pattern` (it must differ from the problem's own pattern, which
  can't be an `alternates` entry either), `trigger` (word for word in the twist statement), `ds`,
  `why`, `approach` and exactly 3 `nearMiss` entries. One of those must be the original
  pattern.

Then run the checks below.

## Development

```bash
python3 -m http.server 8765        # then open http://localhost:8765
node tools/run-tests.mjs           # engine tests + bank validation (also: open /test.html)
python3 tools/check_links.py       # every lesson link resolves
```

On localhost the service worker is only registered with `?sw` in the URL, so dev edits aren't
cached. Bump `VERSION` in `sw.js` whenever the list of app files changes.

Each push to `main` runs the tests and validation, then deploys to GitHub Pages
(`.github/workflows/pages.yml`). A weekly job checks the links without blocking deploys.
