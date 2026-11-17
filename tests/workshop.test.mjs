/**
 * Tests for workshop.js (parsing and answer checking) and for the SQL exercise and break-it files.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseExercises, parseBreakIt, compareResults, formatCell, toResultSet,
} from '../workshop.js';
import { createWorkshopDb, readSqlFile } from './helpers.mjs';

const exact = { id: 99, check: 'exact', sorted: null };
const rs = (columns, rows) => ({ columns, rows });

describe('parseExercises', () => {
  const sample = `-- header comment that is ignored
-- @exercise 1
-- @level One table
-- @prompt Show 10 students.
-- @live
-- @check shape
SELECT * FROM students LIMIT 10;

-- @exercise 2
-- @level One table
-- @prompt Events in October, earliest first.
-- @hint Use WHERE and ORDER BY.
-- @sorted 2 asc
SELECT title, event_date
FROM events
ORDER BY event_date;
`;

  test('reads metadata and multi-line SQL', () => {
    const [first, second] = parseExercises(sample);
    assert.deepEqual(first, {
      id: 1, level: 'One table', prompt: 'Show 10 students.', hint: null,
      sql: 'SELECT * FROM students LIMIT 10;', live: true, check: 'shape', sorted: null,
    });
    assert.equal(second.hint, 'Use WHERE and ORDER BY.');
    assert.equal(second.live, false);
    assert.equal(second.check, 'exact');
    assert.deepEqual(second.sorted, { column: 2, direction: 'asc' });
    assert.equal(second.sql, 'SELECT title, event_date\nFROM events\nORDER BY event_date;');
  });

  test('names the exercise when a required field is missing', () => {
    assert.throws(() => parseExercises('-- @exercise 7\n-- @level Joins\nSELECT 1;'), /Exercise 7.*@prompt/);
    assert.throws(() => parseExercises('-- @exercise 8\n-- @level Joins\n-- @prompt Hi'), /Exercise 8.*SQL/);
  });

  test('rejects unknown keys and bad @sorted values', () => {
    assert.throws(() => parseExercises('-- @exercise 3\n-- @levle x\n-- @prompt p\nSELECT 1;'), /Exercise 3.*@levle/);
    assert.throws(() => parseExercises('-- @exercise 4\n-- @level x\n-- @prompt p\n-- @sorted up\nSELECT 1;'),
      /Exercise 4.*@sorted/);
  });
});

describe('parseBreakIt', () => {
  test('reads expected outcome, explanation, and SQL', () => {
    const statements = parseBreakIt(`-- intro
-- @expect 23503
-- @explain No such student.
INSERT INTO rsvps (netid, event_id) VALUES ('zzz999', 1);

-- @expect ok
-- @explain The sheet accepts anything.
INSERT INTO signups_sheet (netid) VALUES ('zzz999');
`);
    assert.deepEqual(statements, [
      { expect: '23503', explain: 'No such student.', sql: "INSERT INTO rsvps (netid, event_id) VALUES ('zzz999', 1);" },
      { expect: 'ok', explain: 'The sheet accepts anything.', sql: "INSERT INTO signups_sheet (netid) VALUES ('zzz999');" },
    ]);
  });
});

describe('compareResults', () => {
  const expected = rs(['title', 'n'], [['A', 3], ['B', 2]]);

  test('accepts the same rows in a different order', () => {
    assert.equal(compareResults(expected, rs(['x', 'y'], [['B', 2], ['A', 3]]), exact).ok, true);
  });

  test('accepts the same columns in a different order', () => {
    assert.equal(compareResults(expected, rs(['n', 'title'], [[2, 'B'], [3, 'A']]), exact).ok, true);
  });

  test('reports a column count mismatch', () => {
    const result = compareResults(expected, rs(['a', 'b', 'c'], [['A', 3, 1], ['B', 2, 1]]), exact);
    assert.equal(result.ok, false);
    assert.match(result.reason, /expected 2 columns.*got 3/i);
  });

  test('reports a row count mismatch', () => {
    const result = compareResults(expected, rs(['a', 'b'], [['A', 3], ['B', 2], ['C', 1]]), exact);
    assert.match(result.reason, /expected 2 rows.*got 3/i);
  });

  test('reports a value mismatch without revealing the answer', () => {
    const result = compareResults(expected, rs(['a', 'b'], [['A', 3], ['B', 5]]), exact);
    assert.equal(result.ok, false);
    assert.match(result.reason, /B, 5/);
    assert.doesNotMatch(result.reason, /B, 2/);
  });

  test('treats rounding differences within tolerance as equal, but not a different scale', () => {
    const rate = rs(['club', 'turnout'], [['USACS', '0.71']]);
    assert.equal(compareResults(rate, rs(['c', 't'], [['USACS', 0.7134]]), exact).ok, true);
    assert.equal(compareResults(rate, rs(['c', 't'], [['USACS', 71.34]]), exact).ok, false);
  });

  test('treats numbers and numeric strings, and dates and ISO dates, as equal', () => {
    const left = rs(['n', 'd'], [[5, new Date('2025-10-01T00:00:00Z')]]);
    assert.equal(compareResults(left, rs(['n', 'd'], [['5', '2025-10-01']]), exact).ok, true);
  });

  test('integers must match exactly', () => {
    assert.equal(compareResults(rs(['n'], [[297]]), rs(['n'], [[296]]), exact).ok, false);
  });

  test('sorted check allows ties in any order and names the column when out of order', () => {
    const sortedExercise = { ...exact, sorted: { column: 2, direction: 'desc' } };
    const want = rs(['title', 'rsvps'], [['A', 9], ['B', 5], ['C', 5]]);
    assert.equal(compareResults(want, rs(['t', 'r'], [['A', 9], ['C', 5], ['B', 5]]), sortedExercise).ok, true);
    const wrong = compareResults(want, rs(['t', 'r'], [['B', 5], ['A', 9], ['C', 5]]), sortedExercise);
    assert.equal(wrong.ok, false);
    assert.match(wrong.reason, /rsvps/);
  });

  test('sorted check follows the column even when the mentee reorders columns', () => {
    const sortedExercise = { ...exact, sorted: { column: 2, direction: 'asc' } };
    const want = rs(['title', 'day'], [['A', '2025-10-01'], ['B', '2025-10-05']]);
    const swapped = rs(['day', 'title'], [['2025-10-01', 'A'], ['2025-10-05', 'B']]);
    assert.equal(compareResults(want, swapped, sortedExercise).ok, true);
  });

  test('shape check only compares row and column counts', () => {
    const shape = { ...exact, check: 'shape' };
    assert.equal(compareResults(rs(['a'], [[1], [2]]), rs(['b'], [[7], [8]]), shape).ok, true);
    assert.equal(compareResults(rs(['a'], [[1], [2]]), rs(['b'], [[7]]), shape).ok, false);
  });
});

describe('formatCell and toResultSet', () => {
  test('formats nulls, booleans, dates, and numbers for display', () => {
    assert.equal(formatCell(null), 'NULL');
    assert.equal(formatCell(true), 'true');
    assert.equal(formatCell(new Date('2025-10-16T00:00:00Z')), '2025-10-16');
    assert.equal(formatCell(42), '42');
  });

  test('converts a PGlite array-mode result', () => {
    const result = { fields: [{ name: 'a' }, { name: 'b' }], rows: [[1, 'x']], command: 'SELECT', affectedRows: 0 };
    assert.deepEqual(toResultSet(result), { columns: ['a', 'b'], rows: [[1, 'x']], command: 'SELECT', affectedRows: 0 });
  });
});

describe('workshop SQL files', () => {
  let db;
  let exercises;
  let breakIt;
  before(async () => {
    db = await createWorkshopDb();
    exercises = parseExercises(await readSqlFile('exercises.sql'));
    breakIt = parseBreakIt(await readSqlFile('break_it.sql'));
  });
  after(async () => { await db.close(); });

  const runOne = async (sql) => toResultSet((await db.exec(sql, { rowMode: 'array' })).at(-1));

  test('there are 14 exercises numbered 1-14, three of them live demos', () => {
    assert.deepEqual(exercises.map((e) => e.id), Array.from({ length: 14 }, (_, i) => i + 1));
    assert.deepEqual(exercises.filter((e) => e.live).map((e) => e.id), [1, 5, 8]);
  });

  test('every reference answer runs, returns rows, and passes its own check', async () => {
    for (const exercise of exercises) {
      const result = await runOne(exercise.sql);
      assert.ok(result.rows.length > 0, `exercise ${exercise.id} returned no rows`);
      assert.equal(compareResults(result, result, exercise).ok, true, `exercise ${exercise.id}`);
    }
  });

  test('reference answers return the planted facts', async () => {
    const rowsFor = async (id) => (await runOne(exercises.find((e) => e.id === id).sql)).rows;
    assert.equal((await rowsFor(1)).length, 10);
    assert.equal((await rowsFor(6)).length, 7);
    assert.equal((await rowsFor(10)).length, 3);
    assert.equal((await rowsFor(11)).length, 8);
    assert.equal((await rowsFor(12)).length, 1);
    assert.equal((await rowsFor(13)).length, 15);
    assert.equal((await rowsFor(14)).length, 6);
  });

  const checkAgainst = async (id, menteeSql) => {
    const exercise = exercises.find((e) => e.id === id);
    return compareResults(await runOne(exercise.sql), await runOne(menteeSql), exercise);
  };

  test('accepts common correct alternatives a beginner might write', async () => {
    const alternatives = [
      [2, "SELECT event_date, title FROM events WHERE event_date BETWEEN '2025-10-01' AND '2025-10-31' ORDER BY event_date"],
      [3, "SELECT COUNT(netid) AS n FROM students WHERE grad_year = '2028'"],
      [5, 'SELECT c.name, e.title FROM clubs c, events e WHERE c.club_id = e.club_id'],
      [9, 'SELECT e.title, e.event_date, COUNT(r.netid) FROM rsvps r JOIN events e USING (event_id) GROUP BY e.title, e.event_date ORDER BY 3 DESC'],
      [11, 'SELECT c.name, AVG(CASE WHEN r.attended THEN 1.0 ELSE 0 END) FROM clubs c JOIN events e ON e.club_id = c.club_id JOIN rsvps r ON r.event_id = e.event_id GROUP BY c.name ORDER BY 2 DESC'],
      [12, 'SELECT title FROM events WHERE NOT EXISTS (SELECT 1 FROM rsvps WHERE rsvps.event_id = events.event_id)'],
      [13, 'SELECT s.name, s.netid FROM students s JOIN rsvps r ON r.netid = s.netid GROUP BY s.netid HAVING COUNT(*) >= 3 AND NOT bool_or(r.attended)'],
    ];
    for (const [id, sql] of alternatives) {
      const verdict = await checkAgainst(id, sql);
      assert.equal(verdict.ok, true, `exercise ${id}: ${verdict.reason}`);
    }
  });

  test('rejects common mistakes with a helpful reason', async () => {
    const groupedByTitle = await checkAgainst(9,
      'SELECT title, COUNT(*) FROM events JOIN rsvps ON rsvps.event_id = events.event_id GROUP BY title ORDER BY 2 DESC');
    assert.match(groupedByTitle.reason, /Expected 3 columns/);
    const unsorted = await checkAgainst(9,
      'SELECT title, event_date, COUNT(*) FROM events JOIN rsvps ON rsvps.event_id = events.event_id GROUP BY events.event_id ORDER BY title');
    assert.match(unsorted.reason, /wrong order/);
    const percent = await checkAgainst(11,
      'SELECT clubs.name, ROUND(100 * AVG(attended::int), 1) FROM clubs JOIN events USING (club_id) JOIN rsvps USING (event_id) GROUP BY clubs.name ORDER BY 2 DESC');
    assert.match(percent.reason, /values differ/);
    const rsvpedNotAttended = await checkAgainst(7,
      "SELECT students.name FROM students JOIN rsvps ON rsvps.netid = students.netid JOIN events ON events.event_id = rsvps.event_id WHERE events.title = 'Intro to Git'");
    assert.match(rsvpedNotAttended.reason, /rows but got/);
  });

  test('break-it statements fail with the expected error, and the sheet accepts the same mistakes', async () => {
    assert.ok(breakIt.some((s) => s.expect === 'ok'));
    assert.ok(breakIt.some((s) => s.expect !== 'ok'));
    for (const statement of breakIt) {
      if (statement.expect === 'ok') {
        await assert.doesNotReject(db.exec(statement.sql), statement.sql);
      } else {
        await assert.rejects(db.exec(statement.sql), (error) => error.code === statement.expect, statement.sql);
      }
    }
  });
});
