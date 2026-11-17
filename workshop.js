/**
 * Pure logic for the databases workshop page: parsing sql/exercises.sql and sql/break_it.sql,
 * formatting result cells, and checking a mentee's result against the reference answer.
 *
 * This module has no DOM and no database access, so the browser page and the Node tests
 * share exactly the same code.
 *
 * A result set is `{ columns: string[], rows: unknown[][], command?: string, affectedRows?: number }`.
 */

/** Most rows the page renders for one result; the total count is always shown. */
export const MAX_DISPLAY_ROWS = 200;
/** Two non-integer numbers within this distance count as equal (so 0.7134 matches a rounded 0.71). */
export const NUMERIC_TOLERANCE = 0.005;
/** Results with more columns than this are compared only in the mentee's column order. */
const MAX_PERMUTED_COLUMNS = 5;

const EXERCISE_START = /^--\s*@exercise\s+(\d+)\s*$/;
const BREAK_IT_START = /^--\s*@expect\s+(\S+)\s*$/;
const METADATA_LINE = /^--\s*@(\w+)(?:\s+(.*?))?\s*$/;
const SORTED_VALUE = /^(\d+)\s+(asc|desc)$/i;
const SQLSTATE = /^[0-9A-Z]{5}$/;
const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;

const EXERCISE_KEYS = new Set(['level', 'prompt', 'hint', 'live', 'check', 'sorted']);
const BREAK_IT_KEYS = new Set(['explain']);
const CHECK_MODES = new Set(['exact', 'shape']);
const EXPECT_SUCCESS = 'ok';

const PASS = Object.freeze({ ok: true, reason: 'Matches the expected answer.' });

/**
 * Split a file into blocks that each start with a line matching `startPattern`.
 * Text before the first marker (a file header) is ignored.
 */
function splitBlocks(text, startPattern) {
  const blocks = [];
  for (const line of text.split(/\r?\n/)) {
    const start = line.match(startPattern);
    if (start) {
      blocks.push({ marker: start[1], lines: [] });
    } else if (blocks.length > 0) {
      blocks.at(-1).lines.push(line);
    }
  }
  return blocks;
}

/** Separate `-- @key value` metadata lines from SQL; drop trailing comment-only lines. */
function readBlock(lines) {
  const meta = {};
  const sqlLines = [];
  for (const line of lines) {
    const match = line.match(METADATA_LINE);
    if (match) {
      meta[match[1]] = match[2] ?? '';
    } else {
      sqlLines.push(line);
    }
  }
  while (sqlLines.length > 0 && /^\s*(--.*)?$/.test(sqlLines.at(-1))) {
    sqlLines.pop();
  }
  return { meta, sql: sqlLines.join('\n').trim() };
}

/**
 * Parse sql/exercises.sql.
 *
 * Each exercise starts with `-- @exercise <id>` followed by metadata lines and the reference SQL:
 * `@level <name>` and `@prompt <text>` are required; `@hint <text>`, `@live` (instructor demo),
 * `@check exact|shape` (default exact), and `@sorted <column> asc|desc` are optional.
 *
 * @param {string} text file contents
 * @returns {{id:number, level:string, prompt:string, hint:string|null, sql:string, live:boolean,
 *   check:'exact'|'shape', sorted:{column:number, direction:'asc'|'desc'}|null}[]}
 * @throws {Error} naming the exercise and the problem when the file is malformed
 */
export function parseExercises(text) {
  return splitBlocks(text, EXERCISE_START).map(({ marker, lines }) => {
    const id = Number(marker);
    const { meta, sql } = readBlock(lines);
    const fail = (problem) => {
      throw new Error(`Exercise ${id} in exercises.sql: ${problem}`);
    };
    for (const key of Object.keys(meta)) {
      if (!EXERCISE_KEYS.has(key)) fail(`unknown key @${key}`);
    }
    if (!meta.level) fail('missing @level');
    if (!meta.prompt) fail('missing @prompt');
    if (!sql) fail('missing the reference SQL answer');
    const check = meta.check || 'exact';
    if (!CHECK_MODES.has(check)) fail(`@check must be one of: ${[...CHECK_MODES].join(', ')}`);
    let sorted = null;
    if (meta.sorted !== undefined) {
      const match = meta.sorted.match(SORTED_VALUE);
      if (!match) fail(`@sorted must look like "2 asc" or "3 desc", got "${meta.sorted}"`);
      sorted = { column: Number(match[1]), direction: match[2].toLowerCase() };
    }
    return {
      id, level: meta.level, prompt: meta.prompt, hint: meta.hint || null, sql, live: 'live' in meta, check, sorted,
    };
  });
}

/**
 * Parse sql/break_it.sql.
 *
 * Each statement starts with `-- @expect <SQLSTATE|ok>`, then `-- @explain <text>`, then one SQL statement.
 *
 * @param {string} text file contents
 * @returns {{expect:string, explain:string, sql:string}[]}
 * @throws {Error} naming the statement number and the problem when the file is malformed
 */
export function parseBreakIt(text) {
  return splitBlocks(text, BREAK_IT_START).map(({ marker, lines }, index) => {
    const { meta, sql } = readBlock(lines);
    const fail = (problem) => {
      throw new Error(`Statement ${index + 1} in break_it.sql: ${problem}`);
    };
    for (const key of Object.keys(meta)) {
      if (!BREAK_IT_KEYS.has(key)) fail(`unknown key @${key}`);
    }
    if (marker !== EXPECT_SUCCESS && !SQLSTATE.test(marker)) fail(`@expect must be "ok" or a SQLSTATE, got "${marker}"`);
    if (!meta.explain) fail('missing @explain');
    if (!sql) fail('missing SQL');
    return { expect: marker, explain: meta.explain, sql };
  });
}

/** Postgres DATE values arrive as midnight-UTC Date objects; show them as YYYY-MM-DD. */
function isoDate(date) {
  const iso = date.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
}

/**
 * Render one value the way the results table shows it.
 * @param {unknown} value
 * @returns {string}
 */
export function formatCell(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return isoDate(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Convert one PGlite result (queried with `rowMode: 'array'`) into a result set.
 * @param {{fields:{name:string}[], rows:unknown[][], command?:string, affectedRows?:number}} result
 */
export function toResultSet(result) {
  return {
    columns: result.fields.map((field) => field.name),
    rows: result.rows,
    command: result.command,
    affectedRows: result.affectedRows,
  };
}

/** Reduce a value to a comparable form: null, a number, or text. */
function normalize(value) {
  if (value === null || value === undefined) return { kind: 'null' };
  if (typeof value === 'number' || typeof value === 'bigint') return { kind: 'number', number: Number(value) };
  if (typeof value === 'string' && NUMERIC_TEXT.test(value.trim())) return { kind: 'number', number: Number(value) };
  return { kind: 'text', text: formatCell(value) };
}

function valuesEqual(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'null') return true;
  if (a.kind === 'text') return a.text === b.text;
  if (Number.isInteger(a.number) && Number.isInteger(b.number)) return a.number === b.number;
  return Math.abs(a.number - b.number) <= NUMERIC_TOLERANCE;
}

/** Ordering used by the sorted check: numbers numerically, text by code point, NULLs last. */
function compareValues(a, b) {
  if (a.kind === 'null' || b.kind === 'null') return (a.kind === 'null') - (b.kind === 'null');
  if (a.kind === 'number' && b.kind === 'number') return valuesEqual(a, b) ? 0 : a.number - b.number;
  const left = a.kind === 'number' ? String(a.number) : a.text;
  const right = b.kind === 'number' ? String(b.number) : b.text;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Every way to map expected columns onto actual columns, identity first. */
function columnOrders(count) {
  const identity = Array.from({ length: count }, (_, i) => i);
  if (count > MAX_PERMUTED_COLUMNS) return [identity];
  const orders = [];
  const build = (prefix, remaining) => {
    if (remaining.length === 0) {
      orders.push(prefix);
      return;
    }
    remaining.forEach((column, i) => build([...prefix, column], [...remaining.slice(0, i), ...remaining.slice(i + 1)]));
  };
  build([], identity);
  return orders;
}

/** Index of the first actual row with no equal expected row (each expected row used once), or -1. */
function firstUnmatchedRow(want, got) {
  const used = new Array(want.length).fill(false);
  for (let i = 0; i < got.length; i += 1) {
    const j = want.findIndex((row, k) => !used[k] && row.every((value, c) => valuesEqual(value, got[i][c])));
    if (j === -1) return i;
    used[j] = true;
  }
  return -1;
}

function checkSorted(rows, sorted, columnNames) {
  const column = sorted.column - 1;
  const sign = sorted.direction === 'asc' ? 1 : -1;
  for (let i = 1; i < rows.length; i += 1) {
    if (sign * compareValues(rows[i - 1][column], rows[i][column]) > 0) {
      const wanted = sorted.direction === 'asc' ? 'smallest / earliest first' : 'largest first';
      return { ok: false, reason: `Right rows, wrong order: sort by ${columnNames[column]} (${wanted}).` };
    }
  }
  return PASS;
}

/**
 * Check a mentee's result against the reference result for an exercise.
 *
 * Column names never matter and columns may come in any order. Rows may come in any order
 * unless the exercise has `sorted`, in which case rows must be ordered by that column (ties in
 * any order). Non-integer numbers match within NUMERIC_TOLERANCE. The failure reason never
 * reveals expected values, only the shape and one of the mentee's own rows.
 *
 * @param {{columns:string[], rows:unknown[][]}} expected reference result
 * @param {{columns:string[], rows:unknown[][]}} actual mentee result
 * @param {{check:'exact'|'shape', sorted:{column:number, direction:'asc'|'desc'}|null}} exercise
 * @returns {{ok:boolean, reason:string}}
 */
export function compareResults(expected, actual, exercise) {
  const columnCount = expected.columns.length;
  if (actual.columns.length !== columnCount) {
    return {
      ok: false,
      reason: `Expected ${columnCount} columns (${expected.columns.join(', ')}) but got ${actual.columns.length}.`,
    };
  }
  if (actual.rows.length !== expected.rows.length) {
    return { ok: false, reason: `Expected ${expected.rows.length} rows but got ${actual.rows.length}.` };
  }
  if (exercise.check === 'shape') return PASS;

  const want = expected.rows.map((row) => row.map(normalize));
  const got = actual.rows.map((row) => row.map(normalize));
  let firstMismatch = -1;
  for (const order of columnOrders(columnCount)) {
    const reordered = got.map((row) => order.map((column) => row[column]));
    const unmatched = firstUnmatchedRow(want, reordered);
    if (unmatched === -1) {
      return exercise.sorted ? checkSorted(reordered, exercise.sorted, expected.columns) : PASS;
    }
    if (firstMismatch === -1) firstMismatch = unmatched;
  }
  const example = actual.rows[firstMismatch].map(formatCell).join(', ');
  return { ok: false, reason: `Right shape, but some values differ. This row of yours is not in the answer: ${example}` };
}
