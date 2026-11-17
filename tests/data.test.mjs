/**
 * Checks that the generated seed data contains the facts the exercises, slides, and run sheet rely on.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkshopDb, scalar } from './helpers.mjs';

let db;
before(async () => { db = await createWorkshopDb(); });
after(async () => { await db.close(); });

const RSVP_COUNTS_SQL = `
  SELECT e.event_id, e.title, e.capacity, COUNT(r.netid) AS rsvp_count
  FROM events e LEFT JOIN rsvps r ON r.event_id = e.event_id
  GROUP BY e.event_id, e.title, e.capacity`;

test('table sizes match the workshop design', async () => {
  assert.equal(await scalar(db, 'SELECT COUNT(*) FROM clubs'), 8);
  assert.equal(await scalar(db, 'SELECT COUNT(*) FROM students'), 1200);
  assert.equal(await scalar(db, 'SELECT COUNT(*) FROM events'), 120);
  const rsvps = await scalar(db, 'SELECT COUNT(*) FROM rsvps');
  assert.ok(rsvps >= 9000 && rsvps <= 11000, `rsvps = ${rsvps}`);
});

test('exactly 3 events are overbooked', async () => {
  const n = await scalar(db, `SELECT COUNT(*) FROM (${RSVP_COUNTS_SQL}) c WHERE rsvp_count > capacity`);
  assert.equal(n, 3);
});

test('exactly one event has zero RSVPs: Sunrise Photo Walk', async () => {
  const { rows } = await db.query(`SELECT title FROM (${RSVP_COUNTS_SQL}) c WHERE rsvp_count = 0`);
  assert.deepEqual(rows.map((r) => r.title), ['Sunrise Photo Walk']);
});

test('exactly 15 students RSVP 3+ times and never attend', async () => {
  const n = await scalar(db, `
    SELECT COUNT(*) FROM (
      SELECT netid FROM rsvps GROUP BY netid
      HAVING COUNT(*) >= 3 AND SUM(attended::int) = 0) no_shows`);
  assert.equal(n, 15);
});

test('featured student sk101 has 7 RSVPs including the only Intro to Git', async () => {
  const { rows } = await db.query(`SELECT name FROM students WHERE netid = 'sk101'`);
  assert.deepEqual(rows, [{ name: 'Scarlet Knight' }]);
  assert.equal(await scalar(db, `SELECT COUNT(*) FROM rsvps WHERE netid = 'sk101'`), 7);
  assert.equal(await scalar(db, `SELECT COUNT(*) FROM events WHERE title = 'Intro to Git'`), 1);
  assert.equal(await scalar(db, `
    SELECT COUNT(*) FROM rsvps r JOIN events e ON e.event_id = r.event_id
    WHERE r.netid = 'sk101' AND e.title = 'Intro to Git' AND r.attended`), 1);
});

test('event 26 is Intro to Git (break_it.sql refers to it by id)', async () => {
  const { rows } = await db.query('SELECT title FROM events WHERE event_id = 26');
  assert.deepEqual(rows, [{ title: 'Intro to Git' }]);
});

test('exercise 12 prompt holds: 119 of 120 events have at least one RSVP', async () => {
  assert.equal(await scalar(db, 'SELECT COUNT(DISTINCT event_id) FROM rsvps'), 119);
});

test('turnout differs by club so exercise 11 has a clear best and worst', async () => {
  const { rows } = await db.query(`
    SELECT c.name, AVG(r.attended::int)::float AS turnout
    FROM clubs c JOIN events e ON e.club_id = c.club_id JOIN rsvps r ON r.event_id = e.event_id
    GROUP BY c.name ORDER BY turnout DESC`);
  assert.equal(rows[0].name, 'Robotics Club');
  assert.equal(rows.at(-1).name, 'Photography Club');
  assert.ok(rows[0].turnout - rows[1].turnout >= 0.02, 'best club should lead clearly');
});

test('overall attendance is realistic (60-80%)', async () => {
  const rate = await scalar(db, 'SELECT AVG(attended::int) FROM rsvps');
  assert.ok(rate >= 0.6 && rate <= 0.8, `attendance = ${rate}`);
});

test('old sheet shows 10 spellings of 8 clubs', async () => {
  assert.equal(await scalar(db, 'SELECT COUNT(DISTINCT club_name) FROM signups_sheet'), 10);
});

test('old sheet has 6 students with two emails', async () => {
  const n = await scalar(db, `
    SELECT COUNT(*) FROM (
      SELECT netid FROM signups_sheet GROUP BY netid HAVING COUNT(DISTINCT student_email) > 1) s`);
  assert.equal(n, 6);
});

test('old sheet has 3 events listed in two rooms', async () => {
  const n = await scalar(db, `
    SELECT COUNT(*) FROM (
      SELECT event_title, event_date FROM signups_sheet
      GROUP BY event_title, event_date HAVING COUNT(DISTINCT location) > 1) s`);
  assert.equal(n, 3);
});

test('old sheet has every RSVP plus 5 duplicated sign-ups', async () => {
  const rsvps = await scalar(db, 'SELECT COUNT(*) FROM rsvps');
  assert.equal(await scalar(db, 'SELECT COUNT(*) FROM signups_sheet'), rsvps + 5);
  const dupes = await scalar(db, `
    SELECT COUNT(*) FROM (
      SELECT netid, event_title, event_date FROM signups_sheet
      GROUP BY netid, event_title, event_date HAVING COUNT(*) = 2) d`);
  assert.equal(dupes, 5);
});
