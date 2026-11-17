/**
 * Build slides/databases-workshop.pptx, the deck for the Road2SWE databases workshop.
 *
 * Every number, sample row, query, and error message on the slides is read at build time from the
 * real workshop data and SQL files (sql/schema.sql, sql/seed.sql, sql/exercises.sql,
 * sql/break_it.sql), so the deck cannot drift from what mentees see on the workshop page.
 *
 * Setup and run, from databases-workshop/:
 *   npm install                                 # PGlite, used to load the real data
 *   (pptxgenjs is a devDependency, so npm install covers it)
 *   node slides/build_slides.cjs [--out slides/databases-workshop.pptx] [--page-url https://...]
 *
 * If pptxgenjs is installed elsewhere, point Node at it: NODE_PATH=/path/to/node_modules node slides/build_slides.cjs
 * --page-url prints the workshop page link on the wrap-up slide; without it the slide says the link is in the chat.
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const WORKSHOP_DIR = path.resolve(__dirname, '..');
const SQL_DIR = path.join(WORKSHOP_DIR, 'sql');
const DEFAULT_OUT = path.join(__dirname, 'databases-workshop.pptx');

let pptxgen;
try {
  pptxgen = require('pptxgenjs');
} catch (error) {
  console.error('Cannot load pptxgenjs. From databases-workshop/, run `npm install`, '
    + 'or set NODE_PATH to a node_modules folder that has it.');
  process.exit(1);
}

// ---------------------------------------------------------------- theme and layout constants

const THEME = {
  name: 'Road2SWE Databases',
  headFontFace: 'Georgia',
  bodyFontFace: 'Arial',
  colors: {
    dk1: '1E2229', lt1: 'FFFFFF', dk2: '1D2537', lt2: 'EEF1F5',
    accent1: 'C8102E', // scarlet: primary keys, the main accent
    accent2: '1F6F8B', // teal: foreign keys, links between tables
    accent3: 'E0A526', // amber: SQL keywords, highlights
    accent4: '2E7D4F', // green: documents / accepted
    accent5: '6B7280', // gray: muted text
    accent6: '5B4B8A', // purple: spare
    hlink: '1F6F8B', folHlink: '5B4B8A',
  },
};
const HEX = THEME.colors;
const LIGHT_BORDER = 'CBD2DC';
const MUTED_FILL = 'F4F6F9';
const CODE_FONT = 'Courier New';
const CODE_TEXT = 'E8ECF2';
const CODE_STRING = '9FD4B5';

const SLIDE_W = 13.333;
const MARGIN = 0.6;
const CONTENT_W = SLIDE_W - 2 * MARGIN;
const CONTENT_TOP = 1.45;
const GAP = 0.3;
const FOOTER_Y = 6.95;

const SIZE = { title: 32, heading: 20, body: 16, small: 14, caption: 12, badge: 10, code: 14, stat: 54 };

const SQL_KEYWORDS = new Set(('SELECT FROM WHERE JOIN LEFT ON GROUP BY ORDER HAVING COUNT AND OR LIMIT DESC ASC AS '
  + 'DISTINCT INSERT INTO VALUES DELETE IS NULL NOT SUM AVG ROUND').split(' '));

// ---------------------------------------------------------------- data

/** Load the real workshop data into PGlite and collect every figure the slides show. */
async function loadFacts() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { parseExercises, parseBreakIt } = await import(pathToFileURL(path.join(WORKSHOP_DIR, 'workshop.js')).href);
  const read = (name) => fs.readFileSync(path.join(SQL_DIR, name), 'utf8');

  const db = new PGlite();
  await db.exec(read('schema.sql'));
  await db.exec(read('seed.sql'));
  const rows = async (sql) => (await db.query(sql)).rows;
  const one = async (sql) => Number(Object.values((await rows(sql))[0])[0]);
  const day = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value));

  const exercises = parseExercises(read('exercises.sql'));
  const breakIt = parseBreakIt(read('break_it.sql'));
  const exercise = (id) => exercises.find((e) => e.id === id);

  const facts = {
    exercise,
    counts: {
      clubs: await one('SELECT COUNT(*) FROM clubs'),
      events: await one('SELECT COUNT(*) FROM events'),
      students: await one('SELECT COUNT(*) FROM students'),
      rsvps: await one('SELECT COUNT(*) FROM rsvps'),
      sheet: await one('SELECT COUNT(*) FROM signups_sheet'),
    },
    sheetColumns: (await rows(`SELECT column_name FROM information_schema.columns
      WHERE table_name = 'signups_sheet' ORDER BY ordinal_position`)).map((r) => r.column_name),
    openerQuery: 'SELECT DISTINCT club_name FROM signups_sheet ORDER BY club_name;',
    clubSpellings: (await rows('SELECT DISTINCT club_name FROM signups_sheet ORDER BY club_name')).map((r) => r.club_name),
    clubNames: (await rows('SELECT name FROM clubs')).map((r) => r.name),
    twoEmailStudents: await one(`SELECT COUNT(*) FROM (SELECT netid FROM signups_sheet GROUP BY netid
      HAVING COUNT(DISTINCT student_email) > 1) s`),
    twoRoomEvents: await one(`SELECT COUNT(*) FROM (SELECT event_title, event_date FROM signups_sheet
      GROUP BY event_title, event_date HAVING COUNT(DISTINCT location) > 1) s`),
    duplicateSignups: await one(`SELECT COUNT(*) FROM (SELECT netid, event_title, event_date FROM signups_sheet
      GROUP BY netid, event_title, event_date HAVING COUNT(*) > 1) s`),
    emailExample: (await rows(`SELECT netid, student_name, student_email, club_name, event_title, event_date
      FROM signups_sheet WHERE netid = 'ab336' ORDER BY event_date`)).map((r) => ({ ...r, event_date: day(r.event_date) })),
    sharedNames: await one('SELECT COUNT(*) FROM (SELECT name FROM students GROUP BY name HAVING COUNT(*) > 1) s'),
    mostSharedName: (await rows(`SELECT name, COUNT(*) AS n FROM students GROUP BY name
      ORDER BY n DESC, name LIMIT 1`))[0],
    featuredRsvps: await one(`SELECT COUNT(*) FROM rsvps WHERE netid = 'sk101'`),
    chessSheetRows: await one(`SELECT COUNT(*) FROM signups_sheet WHERE club_name = 'Chess Club'`),
    chessMisspelledRows: await one(`SELECT COUNT(*) FROM signups_sheet WHERE club_name = 'Chess club'`),
    eventsPerClub: (await rows(exercise(8).sql)).map((r) => ({ name: r.name, n: Number(r.events_hosted) }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
    joinEvents: (await rows('SELECT event_id, title, club_id FROM events ORDER BY event_id LIMIT 4')),
    cheatSheet: {
      sql: "SELECT title, event_date\nFROM events\nWHERE location = 'CoRE 101'\nORDER BY event_date\nLIMIT 3;",
    },
  };
  facts.joinClubs = await rows(`SELECT club_id, name FROM clubs WHERE club_id IN
    (${facts.joinEvents.map((e) => e.club_id).join(', ')}) ORDER BY club_id`);
  facts.cheatSheet.result = (await rows(facts.cheatSheet.sql)).map((r) => ({ ...r, event_date: day(r.event_date) }));
  facts.cheatSheet.matching = await one(`SELECT COUNT(*) FROM events WHERE location = 'CoRE 101'`);
  facts.havingThreshold = 14;
  facts.havingSql = exercise(8).sql.replace(/;\s*$/, `\nHAVING COUNT(*) > ${facts.havingThreshold};`);
  facts.havingKept = (await rows(facts.havingSql)).map((r) => r.name);

  facts.breakIt = [];
  for (const statement of breakIt) {
    try {
      const [result] = await db.exec(statement.sql);
      facts.breakIt.push({ ...statement, outcome: 'ok', affected: result.affectedRows });
    } catch (error) {
      facts.breakIt.push({ ...statement, outcome: error.code, message: error.message, detail: error.detail });
    }
  }
  await db.close();
  return facts;
}

// ---------------------------------------------------------------- drawing helpers

const fmt = (n) => Number(n).toLocaleString('en-US');

/** Add a plain text box (always flagged as a text box for screen readers). */
function text(slide, value, options) {
  slide.addText(value, { isTextBox: true, margin: 0, valign: 'top', fontSize: SIZE.body, color: HEX.dk1, ...options });
}

/** SQL or JSON lines as colored runs: SQL keywords amber, quoted strings green, everything else light. */
function codeRuns(source, { keywords = SQL_KEYWORDS, fontSize = SIZE.code } = {}) {
  const runs = [];
  const lines = source.split('\n');
  lines.forEach((line, lineIndex) => {
    const tokens = line.split(/('[^']*'|"[^"]*"|\b[A-Za-z_]+\b)/).filter((t) => t !== '');
    if (tokens.length === 0) tokens.push(' ');
    tokens.forEach((token, tokenIndex) => {
      let color = CODE_TEXT;
      let bold = false;
      if (/^['"]/.test(token)) color = CODE_STRING;
      else if (keywords.has(token)) {
        color = HEX.accent3;
        bold = true;
      }
      const last = tokenIndex === tokens.length - 1 && lineIndex < lines.length - 1;
      runs.push({ text: token, options: { color, bold, fontFace: CODE_FONT, fontSize, breakLine: last } });
    });
  });
  return runs;
}

/** A dark rounded code panel. */
function codeBlock(slide, source, { x, y, w, h, fontSize = SIZE.code, keywords } = {}) {
  slide.addShape('roundRect', { x, y, w, h, fill: { color: HEX.dk2 }, line: { color: HEX.dk2 }, rectRadius: 0.08 });
  slide.addText(codeRuns(source, { keywords, fontSize }), {
    isTextBox: true, x: x + 0.2, y: y + 0.12, w: w - 0.4, h: h - 0.24, valign: 'middle', margin: 0,
    lineSpacingMultiple: 1.1,
  });
}

/** pptxgenjs reads a margin array as [left, right, bottom, top], in points. */
const inset = (left, right = left) => [left, right, 0, 0];

/**
 * A filled shape with a centered label. The shape and the text are separate objects because some
 * renderers (macOS Quick Look) draw any shape that carries text as a plain rectangle.
 */
function labeledShape(slide, shape, label, { x, y, w, h, fill, fontSize, color = HEX.lt1, fontFace, rectRadius }) {
  slide.addShape(shape, { x, y, w, h, fill: { color: fill }, line: { color: fill }, ...(rectRadius ? { rectRadius } : {}) });
  text(slide, label, { x, y, w, h, align: 'center', valign: 'middle', fontSize, bold: true, color, fontFace });
}

/** A small rounded label such as "PK" or "FK". */
function badge(slide, label, { x, y, w = 0.42, h = 0.26, fill }) {
  labeledShape(slide, 'roundRect', label, { x, y, w, h, fill, fontSize: SIZE.badge, rectRadius: 0.05 });
}

/** A list with small round markers instead of bullet characters (renders the same everywhere). */
function markerList(slide, items, { x, y, w, itemH, fontSize = SIZE.body, color = HEX.dk1, markerColor = HEX.accent2 }) {
  const marker = 0.12;
  items.forEach((item, i) => {
    const top = y + i * itemH;
    const firstLineCenter = top + (fontSize / 72) * 0.62;
    slide.addShape('ellipse', { x, y: firstLineCenter - marker / 2, w: marker, h: marker, fill: { color: markerColor }, line: { color: markerColor } });
    text(slide, item, { x: x + 0.3, y: top, w: w - 0.3, h: itemH, fontSize, color });
  });
}

/**
 * A database table drawn as a card: a colored header with the table name and one row per column,
 * each column tagged PK and/or FK. Returns the y center of each column row and the card edges.
 */
function tableCard(slide, { x, y, w, name, columns, headerFill = HEX.dk2, rowH = 0.4, headerH = 0.5, caption }) {
  const h = headerH + columns.length * rowH;
  slide.addShape('rect', { x, y, w, h, fill: { color: HEX.lt1 }, line: { color: LIGHT_BORDER, width: 1 } });
  slide.addText(name, {
    isTextBox: true, shape: 'rect', x, y, w, h: headerH, margin: inset(10), valign: 'middle',
    fontFace: CODE_FONT, fontSize: SIZE.body, bold: true, color: HEX.lt1, fill: { color: headerFill },
    line: { color: headerFill },
  });
  const centers = [];
  columns.forEach((column, i) => {
    const rowY = y + headerH + i * rowH;
    centers.push(rowY + rowH / 2);
    const keys = column.keys || [];
    keys.forEach((key, k) => badge(slide, key, {
      x: x + 0.12 + k * 0.48, y: rowY + (rowH - 0.26) / 2, fill: key === 'PK' ? HEX.accent1 : HEX.accent2,
    }));
    const nameX = x + 0.12 + Math.max(keys.length, 1) * 0.48 + 0.05;
    text(slide, column.name, {
      x: nameX, y: rowY, w: x + w - nameX - 0.05, h: rowH, valign: 'middle', fontFace: CODE_FONT, fontSize: SIZE.small,
    });
  });
  if (caption) {
    text(slide, caption, { x, y: y + h + 0.08, w, h: 0.3, fontSize: SIZE.caption, color: HEX.accent5, align: 'center' });
  }
  return { centers, left: x, right: x + w, top: y, bottom: y + h };
}

/** A straight connector between two points, with an optional arrow at the end. */
function connector(slide, x1, y1, x2, y2, { color = HEX.accent2, width = 2, arrow = true } = {}) {
  const line = { color, width, ...(arrow ? { endArrowType: 'triangle' } : {}) };
  const box = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001 };
  slide.addShape('line', { ...box, line, flipH: x2 < x1, flipV: y2 < y1 });
}

/** A grid of cells, used for small sample tables. Returns cell geometry for drawing arrows. */
function grid(slide, { x, y, colW, rowH = 0.38, header, rows, fontSize = SIZE.caption, code = true, cellFill }) {
  const all = [header, ...rows];
  const cells = [];
  all.forEach((row, r) => {
    let cx = x;
    cells.push([]);
    row.forEach((value, c) => {
      const isHeader = r === 0;
      const fill = isHeader ? HEX.dk2 : (cellFill && cellFill(r - 1, c)) || (r % 2 ? HEX.lt1 : MUTED_FILL);
      slide.addText(String(value), {
        isTextBox: true, shape: 'rect', x: cx, y: y + r * rowH, w: colW[c], h: rowH, margin: inset(6),
        valign: 'middle', fontSize, bold: isHeader, fontFace: code ? CODE_FONT : undefined,
        color: isHeader ? HEX.lt1 : HEX.dk1, fill: { color: fill }, line: { color: LIGHT_BORDER, width: 0.75 },
        fit: 'none',
      });
      cells[r].push({ x: cx, y: y + r * rowH, w: colW[c], h: rowH });
      cx += colW[c];
    });
  });
  return cells;
}

/** A big number with a short label under it. */
function stat(slide, { x, y, w, value, label, color = HEX.accent1 }) {
  text(slide, String(value), { x, y, w, h: 0.95, fontFace: 'Georgia', fontSize: SIZE.stat, bold: true, color, valign: 'bottom' });
  text(slide, label, { x, y: y + 1.0, w, h: 0.6, fontSize: SIZE.small, color: HEX.dk1 });
}

/** A light card with a bold heading and body text. */
function card(slide, { x, y, w, h, heading, body, fill = MUTED_FILL }) {
  slide.addShape('roundRect', { x, y, w, h, fill: { color: fill }, line: { color: fill }, rectRadius: 0.08 });
  text(slide, heading, { x: x + 0.25, y: y + 0.2, w: w - 0.5, h: 0.45, fontSize: SIZE.heading, bold: true });
  if (body) text(slide, body, { x: x + 0.25, y: y + 0.7, w: w - 0.5, h: h - 0.9, fontSize: SIZE.body });
}

// ---------------------------------------------------------------- slides

function defineLayouts(pres) {
  const footer = (color) => ({
    text: {
      text: 'Road2SWE · Databases workshop',
      options: { x: MARGIN, y: FOOTER_Y, w: 6, h: 0.3, fontSize: SIZE.caption, color, isTextBox: true, margin: 0 },
    },
  });
  const titlePlaceholder = (color) => ({
    placeholder: {
      options: {
        name: 'title', type: 'title', x: MARGIN, y: 0.35, w: CONTENT_W, h: 0.9, fontSize: SIZE.title, bold: true,
        color, valign: 'middle', align: 'left', margin: 0,
      },
      text: '',
    },
  });
  pres.defineSlideMaster({
    title: 'TITLE_DARK',
    background: { color: HEX.dk2 },
    objects: [
      {
        placeholder: {
          options: {
            name: 'title', type: 'title', x: MARGIN + 0.2, y: 2.0, w: 7.6, h: 1.8, fontSize: 48, bold: true,
            color: HEX.lt1, valign: 'bottom', align: 'left', margin: 0,
          },
          text: '',
        },
      },
      {
        placeholder: {
          options: {
            name: 'body', type: 'body', x: MARGIN + 0.2, y: 4.05, w: 7.4, h: 1.6, fontSize: SIZE.heading,
            color: 'C9D1DD', valign: 'top', align: 'left', margin: 0,
          },
          text: '',
        },
      },
    ],
  });
  pres.defineSlideMaster({
    title: 'CONTENT',
    background: { color: HEX.lt1 },
    objects: [footer(HEX.accent5), titlePlaceholder(HEX.dk1)],
    slideNumber: { x: SLIDE_W - MARGIN - 0.5, y: FOOTER_Y, w: 0.5, h: 0.3, fontSize: SIZE.caption, color: HEX.accent5, align: 'right' },
  });
  pres.defineSlideMaster({
    title: 'CONTENT_DARK',
    background: { color: HEX.dk2 },
    objects: [footer('9AA4B2'), titlePlaceholder(HEX.lt1)],
    slideNumber: { x: SLIDE_W - MARGIN - 0.5, y: FOOTER_Y, w: 0.5, h: 0.3, fontSize: SIZE.caption, color: '9AA4B2', align: 'right' },
  });
}

function addSlide(pres, section, masterName, title) {
  const slide = pres.addSlide({ masterName, sectionTitle: section });
  slide.addText(title, { placeholder: 'title' });
  return slide;
}

function slideTitle(pres, section, facts) {
  const slide = pres.addSlide({ masterName: 'TITLE_DARK', sectionTitle: section });
  slide.addText('Databases:\ndesign first', { placeholder: 'title' });
  slide.addText('Build a club-events database, ask it questions with SQL, and see when documents fit better.\n'
    + 'Road2SWE workshop · 60 minutes', { placeholder: 'body' });
  const cardW = 1.85;
  const rowH = 0.36;
  const x1 = 8.55;
  const x2 = x1 + cardW + 0.45;
  const clubs = tableCard(slide, { x: x1, y: 1.3, w: cardW, name: 'clubs', columns: [{ name: 'club_id', keys: ['PK'] }, { name: 'name' }], rowH, headerFill: '3A4A68' });
  const events = tableCard(slide, { x: x2, y: 1.3, w: cardW, name: 'events', columns: [{ name: 'event_id', keys: ['PK'] }, { name: 'club_id', keys: ['FK'] }], rowH, headerFill: HEX.accent2 });
  const students = tableCard(slide, { x: x1, y: 4.3, w: cardW, name: 'students', columns: [{ name: 'netid', keys: ['PK'] }, { name: 'name' }], rowH, headerFill: '3A4A68' });
  const rsvps = tableCard(slide, { x: x2, y: 4.3, w: cardW, name: 'rsvps', columns: [{ name: 'netid', keys: ['FK'] }, { name: 'event_id', keys: ['FK'] }], rowH, headerFill: HEX.accent1 });
  connector(slide, events.left, events.centers[1], clubs.right, clubs.centers[0], { color: '8FB8C8' });
  connector(slide, rsvps.left, rsvps.centers[0], students.right, students.centers[0], { color: '8FB8C8' });
  connector(slide, x2 + cardW / 2, rsvps.top, x2 + cardW / 2, events.bottom, { color: '8FB8C8' });
  slide.addNotes(`Welcome. Today: design a database for club events, query real data (${fmt(facts.counts.rsvps)} RSVPs), `
    + 'and see one case where a document database fits better.\n'
    + 'Plan: 5 min old sheet, 12 min design in groups, 8 min reveal and break it, 23 min queries, 9 min MongoDB, 3 min wrap-up.');
}

function slideOldSheet(pres, section, facts) {
  const slide = addSlide(pres, section, 'CONTENT', 'Today: one big sign-up sheet');
  const columns = ['netid', 'student_name', 'student_email', 'club_name', 'event_title', 'event_date'];
  const colW = [1.0, 1.7, 3.15, 2.25, 1.75, 1.5];
  const changed = facts.emailExample.map((r) => r.student_email);
  const newest = changed.at(-1);
  grid(slide, {
    x: MARGIN, y: CONTENT_TOP + 0.1, colW, rowH: 0.48, fontSize: SIZE.small,
    header: columns,
    rows: facts.emailExample.map((r) => columns.map((c) => r[c])),
    cellFill: (r, c) => (c === 2 && changed[r] !== newest ? 'FBE7B5' : null),
  });
  const studentName = facts.emailExample[0].student_name;
  text(slide, `${facts.emailExample.length} of ${studentName}'s rows in signups_sheet. Which email is right?`, {
    x: MARGIN, y: CONTENT_TOP + 0.1 + 0.48 * (facts.emailExample.length + 1) + 0.12, w: CONTENT_W, h: 0.35,
    fontSize: SIZE.small, color: HEX.accent5, italic: true,
  });
  const statsY = 4.75;
  const colWidth = (CONTENT_W - 2 * GAP) / 3;
  stat(slide, { x: MARGIN, y: statsY - 0.1, w: colWidth, value: fmt(facts.counts.sheet), label: `rows, ${facts.sheetColumns.length} columns, all of them free text`, color: HEX.dk2 });
  card(slide, { x: MARGIN + colWidth + GAP, y: statsY, w: colWidth, h: 1.85, heading: 'Everything repeats', body: 'Every sign-up retypes the student, the club, and the event.' });
  card(slide, { x: MARGIN + 2 * (colWidth + GAP), y: statsY, w: colWidth, h: 1.85, heading: 'Nothing is checked', body: 'Any text goes in any cell. Typos and stale copies pile up.' });
  slide.addNotes('Say: "This is how the club tracks sign-ups today: one big sheet." '
    + `Point at the email column: ${studentName} (${facts.emailExample[0].netid}) appears with two different emails. `
    + 'Ask: which one is right? If she changes it again, how many rows do you edit?\n'
    + 'Run on the projector: SELECT * FROM signups_sheet LIMIT 5;');
}

function slideSheetProblems(pres, section, facts) {
  const slide = addSlide(pres, section, 'CONTENT', 'One query finds the mess');
  const codeW = 5.9;
  codeBlock(slide, facts.openerQuery.replace(' FROM', '\nFROM').replace(' ORDER', '\nORDER'), { x: MARGIN, y: CONTENT_TOP + 0.05, w: codeW, h: 1.35 });
  const listY = CONTENT_TOP + 1.65;
  const half = Math.ceil(facts.clubSpellings.length / 2);
  const realNames = new Set(facts.clubNames);
  facts.clubSpellings.forEach((name, i) => {
    const col = i < half ? 0 : 1;
    const row = i % half;
    const wrong = !realNames.has(name);
    text(slide, wrong ? `${name}   ← typo` : name, {
      x: MARGIN + 0.1 + col * (codeW / 2), y: listY + row * 0.5, w: codeW / 2 - 0.1, h: 0.45, valign: 'middle',
      fontFace: CODE_FONT, fontSize: SIZE.body, bold: wrong, color: wrong ? HEX.accent1 : HEX.dk1,
    });
  });
  const statX = MARGIN + codeW + 0.7;
  const statW = (SLIDE_W - MARGIN - statX - GAP) / 2;
  const statItems = [
    [facts.clubSpellings.length, `spellings of ${facts.counts.clubs} clubs`],
    [facts.twoEmailStudents, 'students with two different emails'],
    [facts.twoRoomEvents, 'events listed in two rooms at once'],
    [facts.duplicateSignups, 'sign-ups entered twice'],
  ];
  statItems.forEach(([value, label], i) => stat(slide, {
    x: statX + (i % 2) * (statW + GAP), y: CONTENT_TOP + 0.1 + Math.floor(i / 2) * 2.45, w: statW, value, label,
  }));
  slide.addNotes(`Run the query live: ${facts.openerQuery}\n`
    + `It returns ${facts.clubSpellings.length} names for ${facts.counts.clubs} clubs. `
    + 'Then run the two-emails query from the run sheet. Do not explain SQL yet: the point is that the sheet allows these '
    + 'mistakes at all, and a good design makes them impossible.');
}

function slideBrief(pres, section) {
  const slide = addSlide(pres, section, 'CONTENT_DARK', 'Your turn: design the database');
  text(slide, 'USACS wants to replace its sign-up sheet. Students have a NetID, name, email, and graduation year. '
    + 'Clubs host events; each event has a title, date, location, and capacity. Students RSVP to events, and '
    + 'afterwards we record whether they actually came.', {
    x: MARGIN, y: CONTENT_TOP + 0.1, w: 7.6, h: 2.0, fontSize: SIZE.heading, color: HEX.lt1,
  });
  text(slide, 'Your design must answer:', {
    x: MARGIN, y: CONTENT_TOP + 2.35, w: 7.6, h: 0.45, fontSize: SIZE.heading, bold: true, color: HEX.accent3,
  });
  markerList(slide, ['Which events are overbooked?', 'Which club has the best turnout?', 'Which events has a given student signed up for?'], {
    x: MARGIN, y: CONTENT_TOP + 2.95, w: 7.6, itemH: 0.55, fontSize: SIZE.heading, color: HEX.lt1, markerColor: HEX.accent3,
  });
  const cx = 10.45;
  const cy = 3.7;
  const r = 1.45;
  slide.addShape('ellipse', { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { color: HEX.dk2 }, line: { color: HEX.accent3, width: 6 } });
  text(slide, '10:00', { x: cx - r, y: cy - 0.55, w: 2 * r, h: 0.9, align: 'center', valign: 'middle', fontFace: 'Georgia', fontSize: 48, bold: true, color: HEX.lt1 });
  text(slide, 'minutes', { x: cx - r, y: cy + 0.35, w: 2 * r, h: 0.4, align: 'center', fontSize: SIZE.small, color: 'C9D1DD' });
  text(slide, 'Groups of 2–3 · paper\nList tables, their columns, and which column identifies a row.', {
    x: cx - 2.0, y: cy + r + 0.3, w: 4.0, h: 0.9, align: 'center', fontSize: SIZE.small, color: 'C9D1DD',
  });
  slide.addNotes('Groups of 2-3 sketch tables on paper for 10 minutes. Ask for: the tables, the columns in each, and which column identifies a row.\n'
    + 'Walk around with the prompts from the run sheet. Pick two groups with different designs to share for one minute each.');
}

function slideCommonDesigns(pres, section, facts) {
  const slide = addSlide(pres, section, 'CONTENT', 'Designs we often see, and how they break');
  const w = (CONTENT_W - GAP) / 2;
  const h = 2.45;
  const items = [
    ['One big table', 'netid | name | email | club | event | room', `Change an email and you must fix every copy. ${facts.twoEmailStudents} students already have two.`],
    ['A list inside one cell', 'attendees: "ab336, cm525, sk101"', 'You cannot count it, join on it, or stop a mistyped NetID.'],
    ['Numbered columns', 'event1 | event2 | event3', `What about event number 4? sk101 RSVP'd to ${facts.featuredRsvps}.`],
    ['The name as the key', `"${facts.mostSharedName.name}"`, `${facts.sharedNames} names belong to 2+ students (${facts.mostSharedName.n} are called ${facts.mostSharedName.name}). Use the NetID.`],
  ];
  items.forEach(([heading, sample, problem], i) => {
    const x = MARGIN + (i % 2) * (w + GAP);
    const y = CONTENT_TOP + Math.floor(i / 2) * (h + GAP);
    slide.addShape('roundRect', { x, y, w, h, fill: { color: MUTED_FILL }, line: { color: MUTED_FILL }, rectRadius: 0.08 });
    text(slide, heading, { x: x + 0.3, y: y + 0.2, w: w - 0.6, h: 0.45, fontSize: SIZE.heading, bold: true });
    slide.addText(sample, {
      isTextBox: true, shape: 'rect', x: x + 0.3, y: y + 0.8, w: w - 0.6, h: 0.55, margin: inset(10), valign: 'middle',
      fontFace: CODE_FONT, fontSize: SIZE.small, color: HEX.dk1, fill: { color: HEX.lt1 }, line: { color: LIGHT_BORDER, width: 0.75 },
    });
    text(slide, problem, { x: x + 0.3, y: y + 1.55, w: w - 0.6, h: 0.8, fontSize: SIZE.body });
  });
  slide.addNotes('Use this after the groups share. Each design is a reasonable first try; the question is what breaks.\n'
    + `Name as key: run SELECT name, COUNT(*) FROM students GROUP BY name HAVING COUNT(*) > 1; (${facts.sharedNames} rows).\n`
    + 'All four fixes lead to the same idea: one row per thing, and one row per sign-up.');
}

function slideSchema(pres, section, facts) {
  const slide = addSlide(pres, section, 'CONTENT', 'The reference design: four tables');
  const w = 2.5;
  const gap = (CONTENT_W - 4 * w) / 3;
  const xs = [0, 1, 2, 3].map((i) => MARGIN + i * (w + gap));
  const rowH = 0.4;
  const top = CONTENT_TOP + 0.05;
  const clubs = tableCard(slide, { x: xs[0], y: top + rowH, w, name: 'clubs', rowH, caption: `${fmt(facts.counts.clubs)} rows`,
    columns: [{ name: 'club_id', keys: ['PK'] }, { name: 'name' }] });
  const events = tableCard(slide, { x: xs[1], y: top, w, name: 'events', rowH, headerFill: HEX.accent2, caption: `${fmt(facts.counts.events)} rows`,
    columns: [{ name: 'event_id', keys: ['PK'] }, { name: 'club_id', keys: ['FK'] }, { name: 'title' }, { name: 'event_date' }, { name: 'location' }, { name: 'capacity' }] });
  const rsvps = tableCard(slide, { x: xs[2], y: top, w, name: 'rsvps', rowH, headerFill: HEX.accent1, caption: `${fmt(facts.counts.rsvps)} rows`,
    columns: [{ name: 'netid', keys: ['PK', 'FK'] }, { name: 'event_id', keys: ['PK', 'FK'] }, { name: 'attended' }] });
  const students = tableCard(slide, { x: xs[3], y: top, w, name: 'students', rowH, caption: `${fmt(facts.counts.students)} rows`,
    columns: [{ name: 'netid', keys: ['PK'] }, { name: 'name' }, { name: 'email' }, { name: 'grad_year' }] });
  connector(slide, events.left, events.centers[1], clubs.right, clubs.centers[0]);
  connector(slide, rsvps.left, rsvps.centers[1], events.right, events.centers[0]);
  connector(slide, rsvps.right, rsvps.centers[0], students.left, students.centers[0]);
  const label = (value, x, y) => text(slide, value, { x, y, w: 0.6, h: 0.3, fontSize: SIZE.caption, bold: true, color: HEX.accent2, align: 'center' });
  label('1', clubs.right - 0.12, clubs.centers[0] - 0.36);
  label('many', events.left - 0.55, events.centers[1] + 0.06);
  const bandY = 5.15;
  const bandW = (CONTENT_W - GAP) / 2;
  card(slide, { x: MARGIN, y: bandY, w: bandW, h: 1.55, heading: 'One-to-many', body: 'A club hosts many events. Each event stores one club_id that points at its club.' });
  card(slide, { x: MARGIN + bandW + GAP, y: bandY, w: bandW, h: 1.55, heading: 'Many-to-many', body: 'Students go to many events; events have many students. rsvps holds each (student, event) pair once.' });
  slide.addNotes('PK = primary key: identifies one row. FK = foreign key: must match a row in another table.\n'
    + 'Arrows point from the foreign key to the row it refers to.\n'
    + 'Compare with the groups\' designs: who had a separate table for sign-ups? Who used NetID as the key?');
}

function slideKeys(pres, section) {
  const slide = addSlide(pres, section, 'CONTENT', 'Keys are rules the database enforces');
  const w = (CONTENT_W - 2 * GAP) / 3;
  const items = [
    ['PK', HEX.accent1, 'Primary key', 'One value, one row. A NetID names exactly one student.', 'netid VARCHAR(10)\n  PRIMARY KEY'],
    ['FK', HEX.accent2, 'Foreign key', 'Must match a real row elsewhere. An event\'s club_id must be a real club.', 'club_id INTEGER NOT NULL\n  REFERENCES clubs (club_id)'],
    ['PK', HEX.accent1, 'Two-column key', 'The pair must be unique. The same student cannot RSVP to the same event twice.', 'PRIMARY KEY\n  (netid, event_id)'],
  ];
  items.forEach(([tag, color, heading, body, sql], i) => {
    const x = MARGIN + i * (w + GAP);
    const y = CONTENT_TOP + 0.1;
    slide.addShape('roundRect', { x, y, w, h: 5.1, fill: { color: MUTED_FILL }, line: { color: MUTED_FILL }, rectRadius: 0.08 });
    labeledShape(slide, 'ellipse', tag, { x: x + 0.3, y: y + 0.3, w: 0.9, h: 0.9, fill: color, fontSize: SIZE.heading });
    text(slide, heading, { x: x + 0.3, y: y + 1.45, w: w - 0.6, h: 0.45, fontSize: SIZE.heading, bold: true });
    text(slide, body, { x: x + 0.3, y: y + 2.0, w: w - 0.6, h: 1.3, fontSize: SIZE.body });
    codeBlock(slide, sql, { x: x + 0.2, y: y + 3.55, w: w - 0.4, h: 1.25, fontSize: SIZE.caption,
      keywords: new Set(['PRIMARY', 'KEY', 'REFERENCES', 'NOT', 'NULL', 'INTEGER', 'VARCHAR']) });
  });
  slide.addNotes('These three lines come straight from sql/schema.sql.\n'
    + 'Next slide: we try to break each rule, and Postgres refuses. Ask the room before each statement: will Postgres accept it?');
}

function slideProtects(pres, section, facts) {
  const slide = addSlide(pres, section, 'CONTENT', 'The database protects itself');
  const refused = facts.breakIt.filter((s) => s.outcome !== 'ok');
  const accepted = facts.breakIt.filter((s) => s.outcome === 'ok');
  const leftW = 7.6;
  const rightX = MARGIN + leftW + 0.5;
  const rightW = SLIDE_W - MARGIN - rightX;
  text(slide, 'Real design: refused', { x: MARGIN, y: CONTENT_TOP, w: leftW, h: 0.4, fontSize: SIZE.heading, bold: true, color: HEX.accent2 });
  text(slide, 'Old sheet: accepted', { x: rightX, y: CONTENT_TOP, w: rightW, h: 0.4, fontSize: SIZE.heading, bold: true, color: HEX.accent1 });
  const labels = {
    '23503': 'foreign key', '23505': 'duplicate key', '23514': 'check',
  };
  const shortWhat = [
    'RSVP for NetID zzz999, who does not exist',
    'sk101 RSVPs to Intro to Git a second time',
    'An event with capacity -5',
    'A second student with sk101\'s email',
    'Delete Chess Club while it has events',
  ];
  const rowH = 0.95;
  refused.forEach((statement, i) => {
    const y = CONTENT_TOP + 0.55 + i * rowH;
    slide.addShape('rect', { x: MARGIN, y, w: leftW, h: rowH - 0.12, fill: { color: MUTED_FILL }, line: { color: MUTED_FILL } });
    text(slide, shortWhat[i] || statement.explain, { x: MARGIN + 0.2, y: y + 0.08, w: leftW - 2.2, h: 0.38, fontSize: SIZE.small, bold: true });
    const why = statement.outcome === '23514' ? statement.message.replace(/^new row for relation "\w+" /, '') : (statement.detail || statement.message);
    text(slide, why, { x: MARGIN + 0.2, y: y + 0.47, w: leftW - 0.4, h: 0.32, fontFace: CODE_FONT, fontSize: SIZE.caption, color: HEX.accent5 });
    badge(slide, `${statement.outcome} ${labels[statement.outcome] || ''}`.trim(), { x: MARGIN + leftW - 1.95, y: y + 0.1, w: 1.8, h: 0.32, fill: HEX.accent2 });
  });
  const sheetLines = [
    'Sign-up for zzz999: saved',
    'Second sk101 sign-up: saved',
    'Capacity "-5": saved',
    `Delete Chess Club: ${fmt(accepted.at(-1).affected)} rows gone, ${facts.chessMisspelledRows} "Chess club" rows survive`,
  ];
  const rightRows = [0, 1, 2, 4];
  sheetLines.forEach((line, i) => {
    const y = CONTENT_TOP + 0.55 + rightRows[i] * rowH;
    slide.addShape('rect', { x: rightX, y, w: rightW, h: rowH - 0.12, fill: { color: 'FBE9EC' }, line: { color: 'FBE9EC' } });
    text(slide, line, { x: rightX + 0.2, y: y + 0.08, w: rightW - 0.4, h: rowH - 0.28, fontSize: SIZE.small, valign: 'middle' });
  });
  const blankY = CONTENT_TOP + 0.55 + 3 * rowH;
  text(slide, 'The sheet has no rule about emails at all.', { x: rightX + 0.2, y: blankY + 0.08, w: rightW - 0.4, h: rowH - 0.28, fontSize: SIZE.small, italic: true, color: HEX.accent5, valign: 'middle' });
  slide.addNotes('Run sql/break_it.sql one statement at a time (psql: \\set ON_ERROR_STOP off), or use the page\'s "Try to break it" tab.\n'
    + 'Before each one, ask: will Postgres accept this? The error text on the slide is exactly what Postgres prints.\n'
    + 'Then share the workshop page link: everyone opens it now.');
}

function slideSelect(pres, section, facts) {
  const slide = addSlide(pres, section, 'CONTENT', 'Reading a query, one clause at a time');
  const lines = facts.cheatSheet.sql.split('\n');
  const notes = ['which columns to show', 'which table', 'which rows to keep', 'in what order', 'how many rows at most'];
  const codeW = 5.2;
  const lineH = 0.62;
  const top = CONTENT_TOP + 0.15;
  slide.addShape('roundRect', { x: MARGIN, y: top, w: codeW, h: lines.length * lineH + 0.3, fill: { color: HEX.dk2 }, line: { color: HEX.dk2 }, rectRadius: 0.08 });
  lines.forEach((line, i) => {
    const y = top + 0.15 + i * lineH;
    slide.addText(codeRuns(line, { fontSize: SIZE.body }), { isTextBox: true, x: MARGIN + 0.25, y, w: codeW - 0.4, h: lineH, valign: 'middle', margin: 0 });
    connector(slide, MARGIN + codeW + 0.1, y + lineH / 2, MARGIN + codeW + 0.6, y + lineH / 2, { color: HEX.accent5, width: 1.5, arrow: false });
    text(slide, notes[i], { x: MARGIN + codeW + 0.7, y, w: 2.6, h: lineH, valign: 'middle', fontSize: SIZE.body });
  });
  const resultX = MARGIN + codeW + 3.6;
  text(slide, 'Result', { x: resultX, y: top, w: 2.6, h: 0.4, fontSize: SIZE.heading, bold: true });
  grid(slide, {
    x: resultX, y: top + 0.5, colW: [1.95, 1.3], rowH: 0.48, fontSize: SIZE.caption,
    header: ['title', 'event_date'], rows: facts.cheatSheet.result.map((r) => [r.title, r.event_date]),
  });
  text(slide, `${facts.cheatSheet.matching} events are in CoRE 101; LIMIT 3 keeps the first 3.`, {
    x: resultX, y: top + 0.5 + 0.48 * (facts.cheatSheet.result.length + 1) + 0.15, w: 3.25, h: 0.9, fontSize: SIZE.caption, color: HEX.accent5,
  });
  const tipsY = 5.3;
  const tipW = (CONTENT_W - 2 * GAP) / 3;
  [
    ['Text and dates', "go in single quotes: 'CoRE 101', '2025-10-01'"],
    ['COUNT(*)', 'counts the rows that are left'],
    ['End with ;', 'the semicolon ends one statement'],
  ].forEach(([heading, body], i) => card(slide, { x: MARGIN + i * (tipW + GAP), y: tipsY, w: tipW, h: 1.4, heading, body }));
  slide.addNotes('Read the query top to bottom out loud. Postgres actually runs FROM first, then WHERE, then SELECT, then ORDER BY and LIMIT.\n'
    + 'This example is not one of the exercises on purpose. Live-code exercise 1 next, then let mentees do 2-4.');
}

function slideJoin(pres, section, facts) {
  const slide = addSlide(pres, section, 'CONTENT', 'JOIN: match rows across tables');
  const rowH = 0.46;
  const top = CONTENT_TOP + 0.45;
  text(slide, 'events', { x: MARGIN, y: CONTENT_TOP, w: 3, h: 0.4, fontSize: SIZE.heading, bold: true, fontFace: CODE_FONT });
  const eventCells = grid(slide, {
    x: MARGIN, y: top, colW: [2.4, 1.0], rowH, fontSize: SIZE.caption,
    header: ['title', 'club_id'], rows: facts.joinEvents.map((e) => [e.title, e.club_id]),
    cellFill: (r, c) => (c === 1 ? 'DCEBF1' : null),
  });
  const clubsX = MARGIN + 4.0;
  text(slide, 'clubs', { x: clubsX, y: CONTENT_TOP, w: 3, h: 0.4, fontSize: SIZE.heading, bold: true, fontFace: CODE_FONT });
  const clubCells = grid(slide, {
    x: clubsX, y: top, colW: [1.0, 2.1], rowH, fontSize: SIZE.caption,
    header: ['club_id', 'name'], rows: facts.joinClubs.map((c) => [c.club_id, c.name]),
    cellFill: (r, c) => (c === 0 ? 'DCEBF1' : null),
  });
  facts.joinEvents.forEach((event, i) => {
    const target = facts.joinClubs.findIndex((c) => c.club_id === event.club_id);
    const from = eventCells[i + 1][1];
    const to = clubCells[target + 1][0];
    connector(slide, from.x + from.w + 0.05, from.y + rowH / 2, to.x - 0.05, to.y + rowH / 2, { width: 1.75 });
  });
  const resultX = clubsX + 3.1 + 0.6;
  text(slide, 'result', { x: resultX, y: CONTENT_TOP, w: 3, h: 0.4, fontSize: SIZE.heading, bold: true, fontFace: CODE_FONT });
  const byId = new Map(facts.joinClubs.map((c) => [c.club_id, c.name]));
  grid(slide, {
    x: resultX, y: top, colW: [2.2, 2.1], rowH, fontSize: SIZE.caption,
    header: ['title', 'name'], rows: facts.joinEvents.map((e) => [e.title, byId.get(e.club_id)]),
  });
  codeBlock(slide, facts.exercise(5).sql, { x: MARGIN, y: 4.45, w: 7.3, h: 1.45 });
  text(slide, 'ON says which columns must be equal. Each event row finds its one club row.', {
    x: MARGIN + 7.6, y: 4.45, w: CONTENT_W - 7.6, h: 1.45, valign: 'middle', fontSize: SIZE.body,
  });
  slide.addNotes('This is exercise 5: live-code it. The first four events and their clubs are shown.\n'
    + 'Point out events.title vs clubs.name: write table.column when two tables share a column name, or Postgres raises error 42702.\n'
    + 'Then mentees do exercises 6 and 7 (7 needs three tables).');
}

function slideGroupBy(pres, section, facts) {
  const slide = addSlide(pres, section, 'CONTENT', 'GROUP BY: one row per group');
  codeBlock(slide, facts.exercise(8).sql, { x: MARGIN, y: CONTENT_TOP + 0.05, w: 6.1, h: 1.75 });
  const steps = [
    ['1', `JOIN gives one row per event: ${facts.counts.events} rows, each with its club's name.`],
    ['2', `GROUP BY clubs.name sorts them into ${facts.counts.clubs} piles, one per club.`],
    ['3', 'COUNT(*) counts each pile. One output row per pile.'],
  ];
  steps.forEach(([n, body], i) => {
    const y = CONTENT_TOP + 2.15 + i * 1.05;
    labeledShape(slide, 'ellipse', n, { x: MARGIN, y, w: 0.6, h: 0.6, fill: HEX.accent2, fontSize: SIZE.heading });
    text(slide, body, { x: MARGIN + 0.85, y: y - 0.1, w: 5.25, h: 0.85, valign: 'middle', fontSize: SIZE.body });
  });
  const data = facts.eventsPerClub;
  slide.addChart(pres.charts.BAR, [{ name: 'Events hosted', labels: data.map((d) => d.name), values: data.map((d) => d.n) }], {
    x: MARGIN + 6.6, y: CONTENT_TOP, w: CONTENT_W - 6.6, h: 5.2, barDir: 'bar', catAxisOrientation: 'maxMin',
    chartColors: [HEX.accent2], showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 12,
    dataLabelColor: HEX.dk1, dataLabelFontFace: '+mn-lt', catAxisLabelFontSize: 13, catAxisLabelColor: HEX.dk1,
    catAxisLabelFontFace: '+mn-lt', valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
    showLegend: false, showTitle: true, title: 'Result: events hosted per club', titleFontSize: 14, titleColor: HEX.dk1,
    titleFontFace: '+mn-lt', barGapWidthPct: 40,
  });
  slide.addNotes('This is exercise 8: live-code it, then show the result.\n'
    + 'Error 42803 means a selected column is neither in GROUP BY nor inside COUNT/SUM/AVG.\n'
    + 'Exercise 9 must group by events.event_id because titles repeat (12 Weekly Chess Nights).');
}

function slideHaving(pres, section, facts) {
  const slide = addSlide(pres, section, 'CONTENT', 'HAVING: keep only some groups');
  codeBlock(slide, facts.havingSql, { x: MARGIN, y: CONTENT_TOP + 0.05, w: 6.1, h: 2.05 });
  card(slide, { x: MARGIN, y: CONTENT_TOP + 2.4, w: 6.1, h: 1.6, heading: 'WHERE vs HAVING', body: 'WHERE filters rows before grouping. HAVING filters the groups after counting.' });
  text(slide, 'Exercises 10 and 13 need HAVING.', { x: MARGIN, y: CONTENT_TOP + 4.3, w: 6.1, h: 0.45, fontSize: SIZE.body, bold: true, color: HEX.accent1 });
  const kept = new Set(facts.havingKept);
  const data = facts.eventsPerClub;
  slide.addChart(pres.charts.BAR, [
    { name: `Kept: more than ${facts.havingThreshold} events`, labels: data.map((d) => d.name), values: data.map((d) => (kept.has(d.name) ? d.n : 0)) },
    { name: 'Filtered out by HAVING', labels: data.map((d) => d.name), values: data.map((d) => (kept.has(d.name) ? 0 : d.n)) },
  ], {
    x: MARGIN + 6.6, y: CONTENT_TOP, w: CONTENT_W - 6.6, h: 5.2, barDir: 'bar', barGrouping: 'clustered', barOverlapPct: 100,
    catAxisOrientation: 'maxMin', chartColors: [HEX.accent1, 'C3C9D2'], showValue: true, dataLabelPosition: 'outEnd',
    dataLabelFormatCode: '0;;;', dataLabelFontSize: 12, dataLabelColor: HEX.dk1, dataLabelFontFace: '+mn-lt',
    catAxisLabelFontSize: 13, catAxisLabelColor: HEX.dk1, catAxisLabelFontFace: '+mn-lt', valAxisHidden: true,
    valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: true, legendPos: 'b', legendFontSize: 12,
    legendColor: HEX.dk1, legendFontFace: '+mn-lt', barGapWidthPct: 40,
  });
  slide.addNotes(`Same query as exercise 8 plus one line. ${facts.havingKept.length} clubs hosted more than ${facts.havingThreshold} events: ${facts.havingKept.join(', ')}.\n`
    + 'Exercises 10, 11, and 13 all use HAVING or GROUP BY. Point out that 10 and 11 answer two of the three questions from the design brief.');
}

const WIDE_ROWS = [
  ['ab336', 'M', '[list?]', 'aishab', 'NULL', 'NULL', 'NULL'],
  ['sk101', 'NULL', 'NULL', 'NULL', 'CS', 'sk101.pdf', '[list?]'],
  ['cm525', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL'],
];

function slideForms(pres, section) {
  const slide = addSlide(pres, section, 'CONTENT', 'New feature: every event asks different questions');
  const forms = [
    ['Fall Hack Night', ['shirt size', 'dietary restrictions (a list)', 'GitHub handle', 'team name']],
    ['Resume Review with Alumni', ['major', 'resume link', 'target roles (a list)']],
    ['Poker Night', ['no extra questions']],
  ];
  const w = (CONTENT_W - 2 * GAP) / 3;
  forms.forEach(([title, questions], i) => {
    const x = MARGIN + i * (w + GAP);
    const y = CONTENT_TOP;
    slide.addShape('roundRect', { x, y, w, h: 2.2, fill: { color: MUTED_FILL }, line: { color: MUTED_FILL }, rectRadius: 0.08 });
    text(slide, title, { x: x + 0.25, y: y + 0.15, w: w - 0.5, h: 0.45, fontSize: SIZE.body, bold: true });
    markerList(slide, questions, { x: x + 0.25, y: y + 0.7, w: w - 0.5, itemH: 0.35, fontSize: SIZE.small });
  });
  const attemptsY = CONTENT_TOP + 2.55;
  const leftW = 7.2;
  text(slide, 'SQL try 1: a column for every question', { x: MARGIN, y: attemptsY, w: leftW, h: 0.4, fontSize: SIZE.body, bold: true });
  grid(slide, {
    x: MARGIN, y: attemptsY + 0.45, colW: [0.95, 0.95, 1.05, 1.0, 1.0, 1.15, 1.1], rowH: 0.4, fontSize: SIZE.caption,
    header: ['netid', 'shirt', 'dietary', 'github', 'major', 'resume', 'roles'],
    rows: WIDE_ROWS,
    cellFill: (r, c) => (WIDE_ROWS[r][c] === 'NULL' ? 'E5E7EB' : null),
  });
  text(slide, 'Mostly NULL, a list does not fit in one cell, and every new question means ALTER TABLE.', {
    x: MARGIN, y: attemptsY + 0.45 + 4 * 0.4 + 0.12, w: leftW, h: 0.7, fontSize: SIZE.small, color: HEX.accent5,
  });
  const rightX = MARGIN + leftW + 0.5;
  const rightW = SLIDE_W - MARGIN - rightX;
  text(slide, 'SQL try 2: one row per answer', { x: rightX, y: attemptsY, w: rightW, h: 0.4, fontSize: SIZE.body, bold: true });
  grid(slide, {
    x: rightX, y: attemptsY + 0.45, colW: [0.95, 1.45, rightW - 2.4], rowH: 0.4, fontSize: SIZE.caption,
    header: ['netid', 'question', 'answer'],
    rows: [['ab336', 'shirt', 'M'], ['ab336', 'dietary', 'vegetarian'], ['ab336', 'dietary', 'nut-free']],
  });
  text(slide, 'Every answer is text, and reading one registration back means gluing rows together.', {
    x: rightX, y: attemptsY + 0.45 + 4 * 0.4 + 0.12, w: rightW, h: 0.7, fontSize: SIZE.small, color: HEX.accent5,
  });
  slide.addNotes('New requirement from the clubs: each event\'s sign-up form asks its own questions, and clubs keep inventing new ones.\n'
    + 'Walk through both SQL attempts. Neither is wrong, but both fight the shape of the data.\n'
    + 'These rows are made-up examples, not part of the workshop database.');
}

function slideDocuments(pres, section) {
  const slide = addSlide(pres, section, 'CONTENT', 'In MongoDB, each document has its own shape');
  const docs = [
    '{\n  netid: "ab336",\n  event: "Fall Hack Night",\n  answers: {\n    shirt_size: "M",\n    dietary: ["vegetarian",\n              "nut-free"],\n    github: "aishab",\n    team: "Null Pointers"\n  }\n}',
    '{\n  netid: "sk101",\n  event: "Resume Review\n          with Alumni",\n  answers: {\n    major: "Computer Science",\n    resume_link: "sk101.pdf",\n    target_roles: ["SWE intern",\n                   "Data intern"]\n  }\n}',
    '{\n  netid: "cm525",\n  event: "Poker Night",\n  answers: {}\n}',
  ];
  const w = (CONTENT_W - 2 * GAP) / 3;
  const none = new Set();
  docs.forEach((doc, i) => codeBlock(slide, doc, { x: MARGIN + i * (w + GAP), y: CONTENT_TOP, w, h: 3.0, fontSize: SIZE.caption, keywords: none }));
  const queryY = CONTENT_TOP + 3.25;
  const qW = (CONTENT_W - GAP) / 2;
  text(slide, 'Who at Hack Night is vegetarian?', { x: MARGIN, y: queryY, w: qW, h: 0.4, fontSize: SIZE.body, bold: true });
  codeBlock(slide, 'db.registrations.find({\n  event: "Fall Hack Night",\n  "answers.dietary": "vegetarian"\n})', { x: MARGIN, y: queryY + 0.45, w: qW, h: 1.45, fontSize: SIZE.caption, keywords: none });
  text(slide, 'How many shirts of each size?', { x: MARGIN + qW + GAP, y: queryY, w: qW, h: 0.4, fontSize: SIZE.body, bold: true });
  codeBlock(slide, 'db.registrations.aggregate([\n  { $match: { event: "Fall Hack Night" } },\n  { $group: { _id: "$answers.shirt_size",\n              count: { $sum: 1 } } }\n])', { x: MARGIN + qW + GAP, y: queryY + 0.45, w: qW, h: 1.45, fontSize: SIZE.caption, keywords: none });
  slide.addNotes('Three registrations in one collection, each with whatever answers its form asked for. No schema change for a new question, and a list is just a list.\n'
    + 'find matches inside the dietary list directly. $group is MongoDB\'s GROUP BY.\n'
    + 'Example documents only: we do not run MongoDB today.');
}

function slideTradeoffs(pres, section) {
  const slide = addSlide(pres, section, 'CONTENT', 'Tables or documents? Look at the shape of the data');
  const w = (CONTENT_W - GAP) / 2;
  const columns = [
    ['Documents fit when…', HEX.accent4, ['each record has its own shape (forms, logs)', 'you read or write a whole record at once', 'the shape keeps changing']],
    ['Tables fit when…', HEX.accent2, ['the data is connected (students ↔ events)', 'you join and count across records', 'the database must enforce rules like keys']],
  ];
  columns.forEach(([heading, color, points], i) => {
    const x = MARGIN + i * (w + GAP);
    slide.addShape('roundRect', { x, y: CONTENT_TOP, w, h: 3.0, fill: { color: MUTED_FILL }, line: { color: MUTED_FILL }, rectRadius: 0.08 });
    slide.addShape('ellipse', { x: x + 0.3, y: CONTENT_TOP + 0.3, w: 0.5, h: 0.5, fill: { color }, line: { color } });
    text(slide, heading, { x: x + 0.95, y: CONTENT_TOP + 0.3, w: w - 1.2, h: 0.5, valign: 'middle', fontSize: SIZE.heading, bold: true });
    markerList(slide, points, { x: x + 0.3, y: CONTENT_TOP + 1.1, w: w - 0.6, itemH: 0.55, markerColor: color });
  });
  const askY = CONTENT_TOP + 3.35;
  slide.addShape('roundRect', { x: MARGIN, y: askY, w: CONTENT_W, h: 1.1, fill: { color: HEX.dk2 }, line: { color: HEX.dk2 }, rectRadius: 0.08 });
  text(slide, 'Would you store RSVPs in MongoDB? How would you find the overbooked events?', {
    x: MARGIN + 0.35, y: askY, w: CONTENT_W - 0.7, h: 1.1, valign: 'middle', fontSize: SIZE.heading, bold: true, color: HEX.lt1,
  });
  text(slide, 'You can have both: Postgres can keep a document inside a table in a JSONB column, so many teams use one database for both shapes.', {
    x: MARGIN, y: askY + 1.3, w: CONTENT_W, h: 0.7, fontSize: SIZE.body, color: HEX.dk1,
  });
  slide.addNotes('Discussion question: would you move RSVPs into MongoDB? You would lose the foreign keys and the easy JOIN and GROUP BY that answered the overbooked question.\n'
    + 'Both directions are real; pick by the shape of the data and the questions you need to ask.');
}

function slideWrap(pres, section, facts, pageUrl) {
  const slide = addSlide(pres, section, 'CONTENT_DARK', 'What to remember');
  const points = [
    ['1', 'Design decides which mistakes are even possible. The database enforces the rules for you.'],
    ['2', 'JOIN connects tables, GROUP BY summarizes them, constraints protect them.'],
    ['3', 'Pick tables or documents by the shape of your data and the questions you ask.'],
  ];
  points.forEach(([n, body], i) => {
    const y = CONTENT_TOP + 0.1 + i * 1.15;
    labeledShape(slide, 'ellipse', n, { x: MARGIN, y, w: 0.75, h: 0.75, fill: HEX.accent3, fontSize: 24, color: HEX.dk2, fontFace: 'Georgia' });
    text(slide, body, { x: MARGIN + 1.05, y: y - 0.05, w: 10.8, h: 0.85, valign: 'middle', fontSize: SIZE.heading, color: HEX.lt1 });
  });
  const boxY = CONTENT_TOP + 3.75;
  slide.addShape('roundRect', { x: MARGIN, y: boxY, w: CONTENT_W, h: 1.4, fill: { color: '2A3550' }, line: { color: '2A3550' }, rectRadius: 0.08 });
  text(slide, 'Keep practicing', { x: MARGIN + 0.35, y: boxY + 0.2, w: 4, h: 0.4, fontSize: SIZE.heading, bold: true, color: HEX.accent3 });
  text(slide, `${pageUrl ? `Workshop page: ${pageUrl}` : 'The workshop page link is in the group chat.'} It runs Postgres in your browser with all ${fmt(facts.counts.rsvps)} RSVPs. Exercises 12\u00A0to\u00A014 are stretch goals; Reset rebuilds the data anytime.`, {
    x: MARGIN + 0.35, y: boxY + 0.65, w: CONTENT_W - 0.7, h: 0.65, fontSize: SIZE.body, color: HEX.lt1,
  });
  slide.addNotes('Recap the three points. Remind them the page stays up and the SQL files load into any Postgres install.');
}

// ---------------------------------------------------------------- theme post-processing

const THEME_SLOTS = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];

/**
 * Write THEME's colors and name into the deck's theme part (pptxgenjs only writes the fonts), and
 * refuse to finish if any color in the deck is not six hex digits (a scheme color given to a hex-only option).
 */
async function applyTheme(deckPath) {
  const JSZip = require(require.resolve('jszip', { paths: [require.resolve('pptxgenjs')] }));
  const zip = await JSZip.loadAsync(fs.readFileSync(deckPath));
  const part = 'ppt/theme/theme1.xml';
  const scheme = `<a:clrScheme name="${THEME.name}">`
    + THEME_SLOTS.map((k) => `<a:${k}><a:srgbClr val="${HEX[k]}"/></a:${k}>`).join('') + '</a:clrScheme>';
  const themeXml = (await zip.file(part).async('string'))
    .replace(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/, () => scheme)
    .replace(/(<a:(?:theme|fontScheme)\b[^>]*?\bname=")[^"]*"/g, (_, head) => `${head}${THEME.name}"`);
  if (!themeXml.includes(scheme)) throw new Error(`${part} has no <a:clrScheme> to replace.`);
  zip.file(part, themeXml);
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) {
      delete zip.files[name];
      continue;
    }
    if (!name.endsWith('.xml')) continue;
    const xml = await zip.file(name).async('string');
    const bad = xml.match(/<a:srgbClr val="((?![0-9A-Fa-f]{6}")[^"]*)"/);
    if (bad) throw new Error(`${name} has a non-hex color "${bad[1]}": a scheme color was passed to a hex-only option.`);
    if (xml.includes('<c:crossesAt val="autoZero"/>')) zip.file(name, xml.replaceAll('<c:crossesAt val="autoZero"/>', '<c:crosses val="autoZero"/>'));
  }
  fs.writeFileSync(deckPath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

// ---------------------------------------------------------------- main

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, pageUrl: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
    else if (argv[i] === '--page-url') args.pageUrl = argv[++i];
    else throw new Error(`Unknown argument "${argv[i]}". Usage: node slides/build_slides.cjs [--out file.pptx] [--page-url URL]`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const facts = await loadFacts();
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = 'Databases: design first';
  pres.author = 'Road2SWE';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  defineLayouts(pres);

  const sections = ['Why design matters', 'Design it', 'Ask questions with SQL', 'When documents fit', 'Wrap-up'];
  sections.forEach((title) => pres.addSection({ title }));
  slideTitle(pres, sections[0], facts);
  slideOldSheet(pres, sections[0], facts);
  slideSheetProblems(pres, sections[0], facts);
  slideBrief(pres, sections[1]);
  slideCommonDesigns(pres, sections[1], facts);
  slideSchema(pres, sections[1], facts);
  slideKeys(pres, sections[1]);
  slideProtects(pres, sections[1], facts);
  slideSelect(pres, sections[2], facts);
  slideJoin(pres, sections[2], facts);
  slideGroupBy(pres, sections[2], facts);
  slideHaving(pres, sections[2], facts);
  slideForms(pres, sections[3]);
  slideDocuments(pres, sections[3]);
  slideTradeoffs(pres, sections[3]);
  slideWrap(pres, sections[4], facts, args.pageUrl);

  await pres.writeFile({ fileName: args.out });
  await applyTheme(args.out);
  console.log(`Wrote ${args.out} (${pres.slides.length} slides)`);
}

main().catch((error) => {
  console.error(`Slide build failed: ${error.message}`);
  process.exit(1);
});
