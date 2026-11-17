/**
 * Workshop page controller: starts PostgreSQL (PGlite) in the browser, loads the workshop SQL
 * files, and wires the editor, results table, tables rail, exercises, and "try to break it" list.
 * Parsing and answer checking live in workshop.js.
 */
import {
  MAX_DISPLAY_ROWS, compareResults, formatCell, parseBreakIt, parseExercises, toResultSet,
} from './workshop.js';

const PGLITE_URL = 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.16/dist/index.js';
const SQL_FILES = {
  schema: 'sql/schema.sql',
  seed: 'sql/seed.sql',
  exercises: 'sql/exercises.sql',
  breakIt: 'sql/break_it.sql',
};
const STORAGE_KEY = 'databases-workshop';
const STARTER_SQL = 'SELECT * FROM clubs;';
const LEGACY_TABLE = 'signups_sheet';
const TABLE_ORDER = ['clubs', 'events', 'students', 'rsvps', LEGACY_TABLE];
const TABLE_NOTES = { [LEGACY_TABLE]: 'The old one-big-sheet design. Nothing is checked.' };
const TYPE_LABELS = {
  'character varying': 'varchar', integer: 'int', boolean: 'bool', date: 'date', text: 'text', bigint: 'bigint', numeric: 'numeric',
};

/** Plain-language help for the errors beginners hit most, keyed by SQLSTATE. */
const ERROR_HELP = {
  23502: ['NOT NULL', 'This column must have a value.'],
  23503: ['Foreign key', 'The row points at something that does not exist, or something still points at the row you are deleting.'],
  23505: ['Unique / primary key', 'A row with this key already exists, and keys cannot repeat.'],
  23514: ['Check constraint', 'The value breaks a rule written into the table.'],
  '42601': ['Syntax error', 'Postgres could not read the query. Look near the word it quotes: a missing comma, quote, or keyword?'],
  '42P01': ['Unknown table', 'Check the spelling against the Tables list on the left.'],
  '42703': ['Unknown column', 'Check the spelling against the Tables list. With a JOIN, write table.column.'],
  '42702': ['Ambiguous column', 'Two joined tables have a column with this name. Write table.column to pick one.'],
  '42803': ['Grouping error', 'With GROUP BY, every column in SELECT must be in the GROUP BY or inside COUNT/SUM/AVG/etc.'],
  '42883': ['Unknown function or operator', 'Check the function name, or compare values of the same type.'],
  '22007': ['Bad date', "Write dates like '2025-10-01', in single quotes."],
  '22P02': ['Bad value', 'The value does not fit the column type, for example text where a number belongs.'],
  '42804': ['Type mismatch', 'The two sides have different types; compare numbers with numbers and text with text.'],
};

const LOAD_HELP_FILE_PROTOCOL = 'This page was opened as a file. Browsers block it from reading the SQL files that way.';

const $ = (id) => document.getElementById(id);
const ui = {
  status: $('status'),
  reset: $('reset-button'),
  run: $('run-button'),
  clear: $('clear-button'),
  editor: $('sql-editor'),
  summary: $('result-summary'),
  results: $('results'),
  tables: $('table-list'),
  exercises: $('exercises-view'),
  breakIt: $('break-view'),
  tabExercises: $('tab-exercises'),
  tabBreak: $('tab-break'),
};

const state = {
  PGlite: null,
  db: null,
  sql: null,
  exercises: [],
  breakIt: [],
  lastResult: null,
  solved: new Set(),
  verdicts: new Map(),
  openPanels: new Set(),
  busy: false,
};

/** Build an element; children may be strings (set as text, never HTML) or nodes. */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/* ---------- per-viewer conveniences (optional; the page works without storage) ---------- */

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return { draft: typeof saved.draft === 'string' ? saved.draft : null, solved: Array.isArray(saved.solved) ? saved.solved : [] };
  } catch (error) {
    console.info('[workshop] saved progress unavailable:', error.message);
    return { draft: null, solved: [] };
  }
}

function savePrefs() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ draft: ui.editor.value, solved: [...state.solved] }));
  } catch (error) {
    console.info('[workshop] could not save progress:', error.message);
  }
}

/* ---------- loading ---------- */

function setStatus(stateName, text) {
  ui.status.dataset.state = stateName;
  ui.status.textContent = text;
}

class LoadError extends Error {
  /** @param {string} title @param {string} message @param {string[]} steps how to fix it */
  constructor(title, message, steps) {
    super(message);
    this.title = title;
    this.steps = steps;
  }
}

async function fetchText(path) {
  let response;
  try {
    response = await fetch(path);
  } catch (error) {
    throw new LoadError('Could not load the workshop files', `${path}: ${error.message}`,
      ['Check the wifi connection, then reload the page.']);
  }
  if (!response.ok) {
    throw new LoadError('Could not load the workshop files', `${path} returned HTTP ${response.status}.`,
      ['Make sure the sql/ folder sits next to index.html, then reload.']);
  }
  return response.text();
}

async function loadSqlFiles() {
  if (location.protocol === 'file:') {
    throw new LoadError('Open this page through a web server', LOAD_HELP_FILE_PROTOCOL, [
      'In a terminal, go to the databases-workshop folder.',
      'Run: python3 -m http.server 8000',
      'Open http://localhost:8000 in your browser.',
    ]);
  }
  const entries = await Promise.all(Object.entries(SQL_FILES).map(async ([key, path]) => [key, await fetchText(path)]));
  return Object.fromEntries(entries);
}

async function loadPGlite() {
  try {
    const module = await import(PGLITE_URL);
    return module.PGlite;
  } catch (error) {
    throw new LoadError('Could not download Postgres', `${PGLITE_URL}: ${error.message}`, [
      'Check the wifi connection (the page downloads about 4 MB from cdn.jsdelivr.net).',
      'Reload the page. If it still fails, follow along on the projector.',
    ]);
  }
}

/** Create a fresh in-memory database and load schema + seed into it. */
async function buildDatabase() {
  const started = performance.now();
  const db = new state.PGlite();
  await db.waitReady;
  await db.exec(state.sql.schema);
  await db.exec(state.sql.seed);
  console.info(`[workshop] database built in ${Math.round(performance.now() - started)} ms`);
  return db;
}

async function boot() {
  const prefs = loadPrefs();
  state.solved = new Set(prefs.solved);
  ui.editor.value = prefs.draft ?? STARTER_SQL;
  wireEvents();
  try {
    const started = performance.now();
    setStatus('loading', 'Downloading Postgres…');
    const [PGlite, sql] = await Promise.all([loadPGlite(), loadSqlFiles()]);
    state.PGlite = PGlite;
    state.sql = sql;
    console.info(`[workshop] PGlite and SQL files fetched in ${Math.round(performance.now() - started)} ms`);
    state.exercises = parseExercises(sql.exercises);
    state.breakIt = parseBreakIt(sql.breakIt);
    renderExercises();
    renderBreakIt();
    setStatus('loading', 'Loading the club database…');
    state.db = await buildDatabase();
    const version = (await state.db.query('SHOW server_version')).rows[0].server_version;
    setStatus('ready', `Ready · PostgreSQL ${version}`);
    ui.run.disabled = false;
    ui.reset.disabled = false;
    renderExercises();
    await renderTables();
    await runEditor();
  } catch (error) {
    showLoadError(error);
  }
}

function showLoadError(error) {
  console.error('[workshop] load failed:', error);
  setStatus('error', 'Postgres is not running');
  const title = error instanceof LoadError ? error.title : 'Something went wrong while starting';
  const steps = error instanceof LoadError ? error.steps : ['Reload the page. If it keeps happening, tell a mentor.'];
  ui.summary.textContent = '';
  ui.results.replaceChildren(el('div', { class: 'notice' },
    el('span', { class: 'notice-title' }, title),
    el('span', { class: 'notice-message' }, error.message),
    el('ol', {}, steps.map((step) => el('li', {}, step)))));
}

/* ---------- running SQL ---------- */

async function runEditor() {
  const sql = ui.editor.value.trim();
  if (!sql) {
    ui.summary.textContent = 'Type a query first.';
    return;
  }
  if (!state.db || state.busy) return;
  state.busy = true;
  ui.run.disabled = true;
  ui.summary.textContent = 'Running…';
  const started = performance.now();
  try {
    const results = await state.db.exec(sql, { rowMode: 'array' });
    const elapsed = Math.round(performance.now() - started);
    if (results.length === 0) {
      ui.summary.textContent = 'Nothing to run (only comments?).';
      return;
    }
    const result = toResultSet(results.at(-1));
    state.lastResult = result.columns.length > 0 ? result : null;
    renderResult(result, elapsed, results.length);
    if (result.columns.length === 0) await renderTables();
  } catch (error) {
    state.lastResult = null;
    renderSqlError(error);
  } finally {
    state.busy = false;
    ui.run.disabled = false;
  }
}

function renderResult(result, elapsed, statementCount) {
  const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
  const ranMany = statementCount > 1 ? ` · ran ${statementCount} statements, showing the last` : '';
  if (result.columns.length === 0) {
    const affected = result.affectedRows ?? 0;
    ui.summary.textContent = `${result.command ?? 'Done'} · ${plural(affected, 'row')} affected · ${elapsed} ms${ranMany}`;
    ui.results.replaceChildren(el('p', { class: 'results-empty' },
      `${result.command ?? 'The statement'} succeeded. Run a SELECT to see the data.`));
    return;
  }
  const total = result.rows.length;
  const shown = result.rows.slice(0, MAX_DISPLAY_ROWS);
  const capped = total > MAX_DISPLAY_ROWS ? ` · showing the first ${MAX_DISPLAY_ROWS}` : '';
  ui.summary.textContent = `${plural(total, 'row')} · ${elapsed} ms${capped}${ranMany}`;
  if (total === 0) {
    ui.results.replaceChildren(el('p', { class: 'results-empty' }, 'No rows matched.'));
    return;
  }
  const header = el('tr', {}, result.columns.map((name) => el('th', { scope: 'col' }, name)));
  const body = shown.map((row) => el('tr', {}, row.map((value) => {
    const isNumber = typeof value === 'number' || typeof value === 'bigint';
    const cls = value === null ? 'null' : isNumber ? 'num' : undefined;
    return el('td', { class: cls }, formatCell(value));
  })));
  ui.results.replaceChildren(el('table', { class: 'results' }, el('thead', {}, header), el('tbody', {}, body)));
}

function renderSqlError(error) {
  const code = error.code ?? '';
  const [name, help] = ERROR_HELP[code] ?? ['Error', null];
  ui.summary.textContent = code ? `Postgres refused the query · SQLSTATE ${code}` : 'Postgres refused the query';
  ui.results.replaceChildren(el('div', { class: 'notice' },
    el('span', { class: 'notice-title' }, code ? `${name} (${code})` : name),
    el('span', { class: 'notice-message' }, error.message),
    error.detail ? el('span', { class: 'notice-message' }, error.detail) : null,
    help ? el('span', { class: 'notice-help' }, help) : null,
    error.hint ? el('span', { class: 'notice-help' }, `Postgres hint: ${error.hint}`) : null));
}

/* ---------- tables rail ---------- */

const COLUMNS_SQL = `
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position`;

const KEYS_SQL = `
  SELECT tc.table_name, kcu.column_name, tc.constraint_type, ccu.table_name AS ref_table
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
  LEFT JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_type = 'FOREIGN KEY' AND ccu.constraint_name = tc.constraint_name
  WHERE tc.table_schema = 'public' AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')`;

const quoteIdent = (name) => `"${name.replaceAll('"', '""')}"`;

async function renderTables() {
  const columns = (await state.db.query(COLUMNS_SQL)).rows;
  const keys = (await state.db.query(KEYS_SQL)).rows;
  const tables = [...new Set(columns.map((c) => c.table_name))].sort((a, b) => {
    const rank = (t) => (TABLE_ORDER.includes(t) ? TABLE_ORDER.indexOf(t) : TABLE_ORDER.length);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  if (tables.length === 0) {
    ui.tables.replaceChildren(el('p', { class: 'results-empty' }, 'No tables. Press Reset database to rebuild them.'));
    return;
  }
  const countSql = tables.map((t) => `SELECT '${t.replaceAll("'", "''")}' AS t, COUNT(*) AS n FROM ${quoteIdent(t)}`).join(' UNION ALL ');
  const counts = new Map((await state.db.query(countSql)).rows.map((r) => [r.t, Number(r.n)]));

  ui.tables.replaceChildren(...tables.map((table) => {
    const badgesFor = (column) => keys
      .filter((k) => k.table_name === table && k.column_name === column)
      .map((k) => {
        if (k.constraint_type === 'PRIMARY KEY') return el('span', { class: 'badge pk', title: 'Primary key' }, 'PK');
        if (k.constraint_type === 'FOREIGN KEY') return el('span', { class: 'badge fk', title: `Foreign key to ${k.ref_table}` }, `FK → ${k.ref_table}`);
        return el('span', { class: 'badge', title: 'Unique' }, 'unique');
      });
    const columnItems = columns.filter((c) => c.table_name === table).map((c) => el('li', {},
      el('span', { class: 'col' }, c.column_name),
      el('span', { class: 'type' }, TYPE_LABELS[c.data_type] ?? c.data_type),
      badgesFor(c.column_name)));
    const count = counts.get(table) ?? 0;
    return el('div', { class: `table-card${table === LEGACY_TABLE ? ' legacy' : ''}` },
      el('button', {
        class: 'table-name', type: 'button', title: `Put SELECT * FROM ${table} LIMIT 10 in the editor`,
        onclick: () => setEditor(`SELECT * FROM ${table} LIMIT 10;`),
      }, el('strong', {}, table), el('span', { class: 'count' }, `${count.toLocaleString()} rows`)),
      TABLE_NOTES[table] ? el('p', { class: 'table-note' }, TABLE_NOTES[table]) : null,
      el('ul', { class: 'columns' }, columnItems));
  }));
}

/* ---------- exercises ---------- */

function setEditor(sql) {
  ui.editor.value = sql;
  savePrefs();
  ui.editor.focus();
}

async function checkExercise(exercise) {
  if (!state.db) return;
  if (!state.lastResult) {
    state.verdicts.set(exercise.id, { ok: false, reason: 'Run a SELECT query first, then check its result.' });
    renderExercises();
    return;
  }
  let expected;
  try {
    expected = toResultSet((await state.db.exec(exercise.sql, { rowMode: 'array' })).at(-1));
  } catch (error) {
    state.verdicts.set(exercise.id, {
      ok: false, reason: `The answer key could not run on your database (${error.message}). If you changed or dropped tables, press Reset database.`,
    });
    renderExercises();
    return;
  }
  const verdict = compareResults(expected, state.lastResult, exercise);
  state.verdicts.set(exercise.id, verdict);
  if (verdict.ok) state.solved.add(exercise.id);
  savePrefs();
  renderExercises();
}

const panelId = (id, kind) => `exercise-${id}-${kind}`;
const isOpen = (id, kind) => state.openPanels.has(panelId(id, kind));

/** A button that shows or hides an exercise's hint or answer. */
function panelToggle(id, kind, label) {
  const open = isOpen(id, kind);
  return el('button', {
    class: 'btn-link', type: 'button', 'aria-expanded': String(open), 'aria-controls': panelId(id, kind),
    onclick: () => {
      if (open) state.openPanels.delete(panelId(id, kind));
      else state.openPanels.add(panelId(id, kind));
      renderExercises();
    },
  }, open ? `Hide ${label.toLowerCase()}` : label);
}

function renderExercises() {
  const levels = [...new Set(state.exercises.map((e) => e.level))];
  const solvedCount = state.exercises.filter((e) => state.solved.has(e.id)).length;
  const progress = el('p', { class: 'progress' },
    `${solvedCount} of ${state.exercises.length} solved. Run your query, then press Check.`);
  const sections = levels.map((level) => el('section', { class: 'level' },
    el('h2', {}, level),
    state.exercises.filter((e) => e.level === level).map((exercise) => {
      const solved = state.solved.has(exercise.id);
      const verdict = state.verdicts.get(exercise.id);
      return el('article', { class: `exercise${solved ? ' solved' : ''}`, id: `exercise-${exercise.id}` },
        el('div', { class: 'exercise-head' },
          el('span', { class: 'exercise-num' }, solved ? `✓${exercise.id}` : String(exercise.id)),
          el('p', { class: 'exercise-prompt' }, exercise.prompt),
          exercise.live ? el('span', { class: 'chip' }, 'Demo') : null),
        el('div', { class: 'exercise-actions' },
          el('button', { class: 'btn', type: 'button', disabled: !state.db, onclick: () => checkExercise(exercise) }, 'Check my result'),
          exercise.hint ? panelToggle(exercise.id, 'hint', 'Hint') : null,
          panelToggle(exercise.id, 'answer', 'Answer')),
        verdict ? el('div', { class: `exercise-extra verdict ${verdict.ok ? 'ok' : 'bad'}`, role: 'status' },
          verdict.ok ? 'Correct!' : verdict.reason) : null,
        isOpen(exercise.id, 'hint') ? el('p', { class: 'exercise-extra hint', id: panelId(exercise.id, 'hint') }, exercise.hint) : null,
        isOpen(exercise.id, 'answer') ? el('div', { class: 'exercise-extra', id: panelId(exercise.id, 'answer') },
          el('pre', { class: 'sql' }, el('code', {}, exercise.sql)),
          el('button', { class: 'btn-link', type: 'button', onclick: () => setEditor(exercise.sql) }, 'Put in editor')) : null);
    })));
  ui.exercises.replaceChildren(progress, ...sections);
}

/* ---------- try to break it ---------- */

function renderBreakIt() {
  const intro = el('p', { class: 'break-intro' },
    'A good design refuses bad data. Put each statement in the editor, run it, and read what Postgres says. '
    + 'The dashed ones go to the old sheet, which accepts everything. Press Reset database afterwards.');
  const items = state.breakIt.map((statement) => {
    const accepted = statement.expect === 'ok';
    const [name] = ERROR_HELP[statement.expect] ?? ['Error'];
    return el('div', { class: `break-item${accepted ? ' sheet' : ''}` },
      el('div', { class: 'break-meta' },
        el('span', { class: accepted ? 'chip' : 'chip done' }, accepted ? 'Old sheet accepts it' : `Refused: ${name}`),
        el('button', { class: 'btn-link', type: 'button', onclick: () => setEditor(statement.sql) }, 'Put in editor')),
      el('pre', { class: 'sql' }, el('code', {}, statement.sql)),
      el('p', {}, statement.explain));
  });
  ui.breakIt.replaceChildren(intro, el('div', { class: 'break-list' }, items));
}

/* ---------- events ---------- */

async function resetDatabase() {
  if (!state.PGlite || state.busy) return;
  state.busy = true;
  ui.reset.disabled = true;
  ui.run.disabled = true;
  setStatus('loading', 'Rebuilding the database…');
  try {
    await state.db?.close();
    state.db = await buildDatabase();
    state.lastResult = null;
    state.verdicts.clear();
    renderExercises();
    await renderTables();
    ui.summary.textContent = 'Database rebuilt from scratch.';
    ui.results.replaceChildren(el('p', { class: 'results-empty' }, 'Every table is back to its original data.'));
    const version = (await state.db.query('SHOW server_version')).rows[0].server_version;
    setStatus('ready', `Ready · PostgreSQL ${version}`);
  } catch (error) {
    showLoadError(error);
  } finally {
    state.busy = false;
    ui.reset.disabled = false;
    ui.run.disabled = !state.db;
  }
}

function selectTab(showExercises) {
  ui.tabExercises.setAttribute('aria-selected', String(showExercises));
  ui.tabBreak.setAttribute('aria-selected', String(!showExercises));
  ui.exercises.hidden = !showExercises;
  ui.breakIt.hidden = showExercises;
}

function wireEvents() {
  ui.run.addEventListener('click', runEditor);
  ui.reset.addEventListener('click', resetDatabase);
  ui.clear.addEventListener('click', () => setEditor(''));
  ui.editor.addEventListener('input', savePrefs);
  ui.editor.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      runEditor();
    }
  });
  ui.tabExercises.addEventListener('click', () => selectTab(true));
  ui.tabBreak.addEventListener('click', () => selectTab(false));
}

boot();
