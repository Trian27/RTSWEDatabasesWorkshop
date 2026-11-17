# Databases Workshop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 1-hour club-events databases workshop described in `docs/superpowers/specs/databases-workshop-design.md`: SQL files, deterministic data generator, an in-browser PostgreSQL workshop page with auto-checked exercises, a .pptx deck, and an instructor run sheet.

**Architecture:** Everything lives in `databases-workshop/`. SQL files are the single source of truth: the page fetches and parses them at runtime, psql runs them unchanged, and Node tests load them into the same PGlite version the page uses. Pure logic (exercise parsing, answer checking) sits in `workshop.js`, which has no DOM or PGlite import so Node can test it; `app.js` owns the DOM.

**Tech Stack:** PostgreSQL 16 (local) / PGlite 0.5.16 (PostgreSQL 18.6 in WASM, browser and Node), Python 3 stdlib (generator), vanilla ES modules + HTML/CSS (no build step), Node `node:test`, the `anthropic-skills:pptx` skill for the deck, headless Google Chrome for a page load check.

**Execution note:** The user authorized implementation directly ("just implement, I'll give feedback later") and the plan author is the executor, so this plan specifies files, interfaces, behaviors, commands, and commits; source code is written straight into the files rather than duplicated here.

**Engineering Standards:** Follow `plan-coding-standards`. Especially relevant here:

- **No magic constants:** generator counts, seed, dates, and planted names are named constants at the top of `generate_seed.py`; the page's display cap (200 rows), numeric tolerance (0.005), and pinned PGlite URL are named constants in `workshop.js`/`app.js`.
- **One implementation per behavior:** exercises and break-it statements exist only in `sql/*.sql`; the page and tests parse them with the same `workshop.js` functions.
- **Docstrings:** module and public-function docstrings in Python; JSDoc on every export of `workshop.js`.
- **Error handling:** specific, actionable page messages for (a) PGlite download failure ("check wifi / jsDelivr reachable"), (b) SQL file fetch failure, including the `file://` case ("serve with `python3 -m http.server`"), (c) a reference query failing because the mentee changed their database ("press Reset"). Postgres errors from mentee SQL are shown verbatim, since they are part of the lesson. No catch-all handlers.
- **Logging:** the generator prints a summary of row counts and planted facts to stderr; the page logs load stages with timings to `console.info`.
- **Security:** mentee SQL runs only in their own in-tab database; all result cells and messages render with `textContent`, never `innerHTML`, so `SELECT '<img onerror=…>'` cannot inject markup.
- **Config:** no environment-specific values; the PGlite CDN URL is a pinned public dependency, not environment config. The generator has a handful of fixed parameters, not many options, so named constants are clearer than a YAML file.
- **Efficiency:** seed uses multi-row `INSERT` batches (500 rows) so the ≈10k-row load is about a second in the browser; the results table renders at most 200 rows.

**Decision tradeoffs:**

- *Committed generated `seed.sql` + generator* vs generating in the browser with `generate_series`: committing the SQL means psql, the page, and tests all see identical data, and the data is inspectable; the cost is a ≈600 KB file. Chosen.
- *Parse metadata comments in `exercises.sql`* vs a separate `exercises.json`: comments keep one file that is both valid SQL for psql and data for the page; the cost is a tiny parser. Chosen.
- *Check the last result* vs re-running the editor SQL on Check: checking the last result never re-executes INSERTs and matches what the mentee is looking at. Chosen.
- *Textarea* vs a code editor library (CodeMirror): textarea needs no dependency and is enough for one-to-five-line queries. Chosen.

**File placement:** a new top-level `databases-workshop/` folder mirrors the existing workshop-per-folder layout (`rtswe-git-workshop/`) and keeps the static site self-contained so it can be served as one directory. `sql/`, `scripts/`, `tests/`, `slides/` separate data, tooling, tests, and presentation.

```
databases-workshop/
  README.md               how to serve, load into Postgres 16, regenerate, test
  INSTRUCTOR.md           run sheet
  index.html              page shell + styles
  app.js                  DOM, PGlite lifecycle
  workshop.js             pure logic (parsing, checking)
  package.json            pins @electric-sql/pglite 0.5.16 for tests
  .gitignore              node_modules/
  sql/schema.sql          4 tables + signups_sheet
  sql/seed.sql            generated
  sql/exercises.sql       14 exercises with metadata
  sql/break_it.sql        constraint demo with expected SQLSTATEs
  scripts/generate_seed.py
  tests/helpers.mjs       loads schema+seed into a fresh PGlite
  tests/data.test.mjs     planted facts
  tests/workshop.test.mjs parser + checker units, exercises + break-it integration
  slides/build_slides.*   deck builder (per pptx skill)
  slides/databases-workshop.pptx
```

---

### Stage 1: Schema, generator, seed data

**Files:** create `databases-workshop/sql/schema.sql`, `databases-workshop/scripts/generate_seed.py`, `databases-workshop/sql/seed.sql` (generated), `databases-workshop/package.json`, `databases-workshop/.gitignore`, `databases-workshop/tests/helpers.mjs`, `databases-workshop/tests/data.test.mjs`.

- [ ] **Step 1: Write `schema.sql`.** Drops then creates `rsvps`, `events`, `students`, `clubs`, `signups_sheet` (drop order respects FKs so the file re-runs in psql). Types: `club_id`/`event_id` `INTEGER PRIMARY KEY` (explicit ids in seed, keeps beginners away from sequences), `netid VARCHAR(10) PRIMARY KEY`, `email VARCHAR(100) UNIQUE NOT NULL`, `event_date DATE NOT NULL`, `capacity INTEGER NOT NULL CHECK (capacity > 0)`, `attended BOOLEAN NOT NULL DEFAULT FALSE`, `PRIMARY KEY (netid, event_id)`. `signups_sheet` columns all `TEXT`, no constraints. Comment each table in plain language for mentees.
- [ ] **Step 2: Write failing data tests** in `tests/data.test.mjs` (behaviors, each its own `test`):
  - row counts: clubs = 8, students = 1200, events = 120, rsvps between 9,000 and 11,000;
  - exactly 3 events have `COUNT(rsvps) > capacity`;
  - exactly 1 event has zero RSVPs and its title is `Sunrise Photo Walk`;
  - exactly 15 students have ≥3 RSVPs and zero attended;
  - `sk101` exists with name `Scarlet Knight` and exactly 7 RSVPs, one of them to `Intro to Git`; exactly one event is titled `Intro to Git`;
  - overall attendance fraction between 0.6 and 0.8;
  - `signups_sheet`: `COUNT(DISTINCT club_name)` = 10; exactly 6 netids with >1 distinct email; exactly 3 (title, date) pairs with >1 distinct location; row count = rsvps + 5; exactly 5 (netid, title, date) groups with count 2.
  `tests/helpers.mjs` exports `createWorkshopDb()` that reads `sql/schema.sql` + `sql/seed.sql` from disk and returns a loaded PGlite instance.
- [ ] **Step 3: Run** `cd databases-workshop && npm install && npm test` — expected FAIL (seed.sql missing).
- [ ] **Step 4: Write `generate_seed.py`** (stdlib, `random.Random(SEED)`): build clubs, students (unique netids from initials+number, `sk101` reserved), events from per-club title templates across Fall 2025 (Sep 3–Dec 12) and Spring 2026 (Jan 21–Apr 29) weekdays, RSVPs by weighted sampling without replacement (student activity × club affinity) with fill ratio per event capped at capacity, then plant: overbooked events (capacity + extra), zero-RSVP event, featured student, no-show students, and repair accidental no-shows. Build `signups_sheet` from RSVPs ordered by date, then plant email changes, room moves, misspellings, duplicates. Validate every planted fact with explicit `ValueError`s naming the fact before writing. Write multi-row INSERTs to `sql/seed.sql` (path argument, default next to the script), print summary to stderr.
- [ ] **Step 5: Generate and test:** `python3 scripts/generate_seed.py && npm test` — expected PASS. Determinism: `python3 scripts/generate_seed.py && git diff --exit-code sql/seed.sql` after committing — expected no diff (run before commit by generating twice to two paths and `cmp`).
- [ ] **Step 6: Commit** `databases-workshop: add schema, deterministic seed generator, and data tests`.

### Stage 2: Exercises, break-it, checker logic

**Files:** create `sql/exercises.sql`, `sql/break_it.sql`, `workshop.js`, `tests/workshop.test.mjs`.

- [ ] **Step 1: Failing unit tests** for `workshop.js`:
  - `parseExercises(text)` returns 14 exercises with `id`, `level`, `prompt`, `hint`, `sql`, `live` (bool), `check` (`"exact"` | `"shape"`), `sorted` (`{column, direction}` or null); throws a message naming the exercise id when `@prompt` is missing.
  - `parseBreakIt(text)` returns statements with `sql`, `expect` (SQLSTATE string or `"ok"`), `explain`.
  - `compareResults(expected, actual, exercise)` → `{ok, reason}`: identical rows in different order pass when unsorted; fail with "expected 2 columns, got 3"; fail with "expected 3 rows, got 4"; numeric `0.714` vs `0.71` passes (tolerance), `71.4` vs `0.71` fails; integer `5` vs `"5"` (bigint/string forms) passes; Date vs `"2025-10-01"` passes; sorted desc check passes with ties in any order and fails when out of order with a reason naming the column; `shape` check only compares row and column counts.
  - `formatCell(value)` renders null as `NULL`, booleans as `true`/`false`, dates as `YYYY-MM-DD`.
- [ ] **Step 2: Run** `npm test` — expected FAIL (module missing).
- [ ] **Step 3: Implement `workshop.js`** (exports above plus constants `MAX_DISPLAY_ROWS = 200`, `NUMERIC_TOLERANCE = 0.005`).
- [ ] **Step 4: Write `exercises.sql` and `break_it.sql`** per the spec tables; integration tests in `tests/workshop.test.mjs`: every exercise's reference SQL runs on a fresh DB and returns ≥1 row (exercise 12 returns exactly 1, 10 returns exactly 3, 13 returns exactly 15, 14 returns exactly 6, 6 returns 7); every break-it statement fails with its expected SQLSTATE or succeeds when `expect ok`; every reference result passes `compareResults` against itself.
- [ ] **Step 5: Run** `npm test` — expected PASS.
- [ ] **Step 6: Commit** `databases-workshop: add exercises, break-it demo, and answer checker`.

### Stage 3: Workshop page

**Files:** create `index.html`, `app.js`.

- [ ] **Step 1: Build page.** Header (title, status pill, Reset). Sidebar: tables from `information_schema.columns` + PK/FK from `information_schema.table_constraints`/`key_column_usage`, row counts. Main: textarea (Ctrl/Cmd+Enter), Run, results (cap 200, total count, elapsed ms) or error (message + SQLSTATE). Exercises panel grouped by level: prompt, hint/answer toggles, Check button, solved ticks. Break-it panel: each statement with "Copy to editor". `localStorage` (try/catch) for draft and solved ids. Light/dark tokens; stacks to one column under 900 px.
- [ ] **Step 2: Load check (headless Chrome):** serve with `python3 -m http.server`, run Chrome `--headless --dump-dom --virtual-time-budget=20000` against it, and confirm the dumped DOM contains the `ready` status and the table names. Fix and repeat until it does.
- [ ] **Step 3: Re-run** `npm test` — PASS.
- [ ] **Step 4: Commit** `databases-workshop: add in-browser Postgres workshop page`.

### Stage 4: Slides

**Files:** `slides/build_slides.*`, `slides/databases-workshop.pptx`.

- [ ] **Step 1:** Load `anthropic-skills:pptx`, follow it to build ≈14 slides from the spec's slide list, using numbers queried from the generated data (no invented figures).
- [ ] **Step 2:** Render to images per the skill and inspect every slide visually; fix overflow/overlap.
- [ ] **Step 3: Commit** `databases-workshop: add workshop slide deck`.

### Stage 5: Run sheet, README, local Postgres 16 check

**Files:** `INSTRUCTOR.md`, `README.md`.

- [ ] **Step 1:** Write `INSTRUCTOR.md` (prep checklist, minute-by-minute, opener demo queries, steering for 4 common designs, break-it demo, per-level live-coding script, Mongo talking points, fallback plan) and `README.md` (serve, load into Postgres 16, regenerate, test, host on GitHub Pages).
- [ ] **Step 2: Postgres 16 check:** `createdb` a throwaway database, run `schema.sql`, `seed.sql`, `exercises.sql` with `ON_ERROR_STOP=1`, run `break_it.sql` and confirm the expected errors, then `dropdb`.
- [ ] **Step 3:** Full gate: `npm test`, generator determinism, headless page check.
- [ ] **Step 4: Commit** `databases-workshop: add instructor run sheet and README`.

---

## Self-review against spec

- Spec "Data" planted facts → Stage 1 tests; "Exercises" + checker rules → Stage 2; "Page behavior" → Stage 3; Mongo segment + slide list → Stage 4; run sheet, README, hosting, Postgres 16 validation → Stage 5. Human check (open page, run exercise 10, Check) is listed in the README and in the final report.
- Names used across stages: `createWorkshopDb`, `parseExercises`, `parseBreakIt`, `compareResults`, `formatCell`, `MAX_DISPLAY_ROWS`, `NUMERIC_TOLERANCE` — consistent.
