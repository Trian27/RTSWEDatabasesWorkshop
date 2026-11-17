# Instructor run sheet

A 60-minute workshop for mentees with little or no SQL. They design tables for a club-events system, compare their design with a reference schema, query real PostgreSQL in the browser, and see one case where a document database fits better.

Materials: the workshop page (`index.html`, see README for hosting), the slides (`slides/databases-workshop.pptx`), the SQL files in `sql/`, and your local PostgreSQL 16 for the projector.

## Before the workshop

- Host the page (README, "Open the workshop page") and open the link on a laptop on a different network than yours. It should say "Ready · PostgreSQL 18.6" within a few seconds.
- Load the same data into your local Postgres for the projector: `createdb club_events && psql -d club_events -f sql/schema.sql -f sql/seed.sql`. Alternatively, project the workshop page itself.
- Make your terminal or SQL client font large enough to read from the back row.
- Have the link ready to paste in the group chat and as a short URL or QR code on the wrap-up slide.

## Run of show

| Time | Segment | You do |
|---|---|---|
| 0–5 | The old sheet | Run the three opener queries below on the projector. |
| 5–17 | Design from requirements | Show the brief slide. Groups of 2–3 sketch tables on paper for 10 minutes; two groups share. |
| 17–25 | Reveal and break it | Schema slide, then run `sql/break_it.sql` one statement at a time. Mentees open the page at the end. |
| 25–48 | Queries | Live-code exercises 1, 5, 8 (marked Demo); mentees do the rest on the page. |
| 48–57 | When documents fit | MongoDB slides and the discussion question. |
| 57–60 | Wrap-up | Recap and links. |

## 0–5 · The old sheet

Say: "This is how the club tracks sign-ups today: one big sheet." Then run:

```sql
SELECT * FROM signups_sheet LIMIT 5;

SELECT DISTINCT club_name FROM signups_sheet ORDER BY club_name;

SELECT netid, COUNT(DISTINCT student_email) AS emails
FROM signups_sheet
GROUP BY netid
HAVING COUNT(DISTINCT student_email) > 1;
```

- The second query returns 10 club names for 8 clubs: `usacs` (12 rows) next to `USACS`, and `Chess club` (8 rows) next to `Chess Club`.
- The third returns 6 students with two emails. Example: `ab336` appears as both `ab336@example.edu` and `aisha.bailey@example.com`. Ask: "Which one is right? If she changes it again, how many rows do you edit?"
- Optional: the sheet also lists three events in two rooms at once (LeetCode Night on 2026-02-26 shows both Hill 114 and Voorhees Mall).

Don't explain the SQL yet. The point is that these mistakes are possible at all, and a design can make them impossible.

## 5–17 · Design from requirements

Show the brief slide. The brief:

> USACS wants to replace its sign-up sheet. Students have a NetID, name, email, and graduation year. Clubs host events; each event has a title, date, location, and capacity. Students RSVP to events, and afterwards we record whether they actually came. Your design must answer: Which events are overbooked? Which club has the best turnout? Which events has a given student signed up for?

Ask groups to list tables, the columns in each, and which column identifies a row. Walk around and use these prompts when you see the usual designs:

| What you see | Ask | Where it leads |
|---|---|---|
| One big table | "A student changes their email. How many rows change? The only RSVP for an event is cancelled: where does the event's room live now?" | Split students, events, and sign-ups into separate tables. |
| An `attendees` column holding `"ab123, cd456"` | "How do you count RSVPs? Find everything sk101 signed up for? Stop a mistyped NetID?" | One row per sign-up: the `rsvps` table. |
| `event1`, `event2`, `event3` columns on students | "What about the student who goes to 40 events?" | Same: one row per sign-up. |
| Student name as the identifier | Run `SELECT name, COUNT(*) FROM students GROUP BY name HAVING COUNT(*) > 1;` | 112 names belong to 2+ students (four Chloe Ramirezes). Use NetID. |
| Club name typed into each event | "The club renames itself. Now what?" | `club_id` pointing at a `clubs` table. |
| No attended column | "How do you tell an RSVP from someone who showed up?" | `attended` on the sign-up row. |

Pick two groups with different designs to share for one minute each.

## 17–25 · Reveal and break it

Show the schema slide. Cover:

- **Primary key (PK):** the column(s) that identify one row. `rsvps` uses the pair (netid, event_id), so the same sign-up can't exist twice.
- **Foreign key (FK):** a column that must match a row in another table. `events.club_id` must be a real club; `rsvps.netid` must be a real student.
- **One-to-many:** a club hosts many events.
- **Many-to-many:** students and events, connected through `rsvps`.

Then run `sql/break_it.sql` one statement at a time (in psql, `\set ON_ERROR_STOP off` first, or use the page's "Try to break it" tab). Before each one, ask the room whether Postgres will accept it:

| Statement | Postgres says |
|---|---|
| RSVP for NetID `zzz999` | Foreign key error (23503) |
| sk101 RSVPs to Intro to Git again | Duplicate key error (23505) |
| Event with capacity -5 | Check constraint error (23514) |
| Second student reusing sk101's email | Duplicate key error (23505) |
| Delete Chess Club while it still has events | Foreign key error (23503) |
| The same four mistakes on `signups_sheet` | All accepted; deleting Chess Club's rows removes 910 rows of history |

Now share the link. Everyone opens the page; the status should turn green.

## 25–48 · Queries

For each level, live-code the Demo exercise while mentees watch, then let them work. They press **Check my result** after running a query; the page compares values and ignores column names and column order. Exercises 1–11 are the core; 12–14 are for fast finishers.

**One table (25–31):** live-code exercise 1. Cover `SELECT … FROM …`, `WHERE`, `ORDER BY`, `LIMIT`, `COUNT(*)`. Text and dates go in single quotes: `'2025-10-01'`.

**Joins (31–39):** live-code exercise 5. Cover `JOIN … ON` with matching ids, and writing `table.column` when two tables share a column name (error 42702 otherwise). Exercise 7 needs three tables.

**Grouping (39–48):** live-code exercise 8. Cover `GROUP BY` (one output row per group), `COUNT(*)` per group, and `HAVING` (filters groups) versus `WHERE` (filters rows). Error 42803 means a selected column is neither grouped nor aggregated. Exercise 9 must group by `event_id`, because titles repeat (12 Weekly Chess Nights).

Point out that exercises 10, 11, and 6 answer the three questions from the brief: "Could your paper design answer these?"

### Answer key (committed seed data)

Reference SQL is in `sql/exercises.sql`. The page's Answer button shows it too.

| # | Rows | What to expect |
|---|---|---|
| 1 | 10 | Any 10 students (checked by shape only) |
| 2 | 17 | October 2025 events, earliest first |
| 3 | 1 | 297 students graduate in 2028 |
| 4 | 30 | Events with capacity over 100 |
| 5 | 120 | Every event with its club |
| 6 | 7 | sk101's events, including Intro to Git |
| 7 | 59 | Intro to Git attendees (78 RSVPs, capacity 80) |
| 8 | 8 | USACS hosted the most events (22) |
| 9 | 119 | Most popular: Robot Battle Showcase on 2025-12-12 (244 RSVPs) |
| 10 | 3 | Fall Hack Night 221/200, Freeroll Poker Tournament 89/80, Resume Review with Alumni 46/40 |
| 11 | 8 | Robotics Club best (0.84), Photography Club worst (0.56) |
| 12 | 1 | Sunrise Photo Walk |
| 13 | 15 | Students who RSVP'd 3+ times and never came |
| 14 | 6 | The six two-email students from the opener |

## 48–57 · When documents fit (MongoDB)

Use the MongoDB slides. Talking points:

- New requirement: every event's sign-up form asks different questions. Hack Night wants shirt size, dietary restrictions (a list), GitHub, and team name. Resume Review wants major, resume link, and target roles. Poker Night asks nothing extra.
- SQL attempt 1, one column per question: a wide table that is mostly NULL, plus an `ALTER TABLE` every time a club invents a question.
- SQL attempt 2, a `(registration, question, answer)` table: every answer becomes text, lists get awkward, and reading one registration back means reassembling rows.
- MongoDB stores each registration as one document with its own answers, so a new question needs no schema change, and a list is just a list.
- Both directions are real. Documents fit data whose shape varies and that you read as a whole. Tables fit data with relationships you join and rules you enforce, like the RSVPs. Postgres can also store documents in a `JSONB` column, so many teams use one database for both.

Discussion question: "Would you move RSVPs into MongoDB? How would you write the overbooked query?" (You would lose the foreign keys and the easy join and group.)

## 57–60 · Wrap-up

- Design decides which mistakes are even possible; the database enforces the rules for you.
- Three tools: `JOIN` connects tables, `GROUP BY` summarizes them, constraints protect them.
- The page stays up, so they can keep practicing; the SQL files load into any Postgres install.

## If something goes wrong

| Problem | Fix |
|---|---|
| The page shows "Could not download Postgres" | Wifi or jsDelivr is blocked for that laptop. Pair the mentee with a neighbor whose page works. |
| The page says to open it through a web server | Someone opened `index.html` as a file. Send them the hosted link. |
| A mentee broke their data (dropped a table, deleted rows) | Press **Reset database**. It rebuilds everything in a few seconds. |
| The tab freezes | Usually a join without `ON` (for example `FROM events, rsvps` is 1.1 million rows). Reload the page. |
| Check says wrong but the result looks right | The reason names the problem: column count, row count, order, or one row that differs. Rounding differences under 0.005 are accepted. |
| Postgres error a mentee doesn't understand | The page explains the common error codes under the message. |

The page was tested in Chrome. It needs a current browser with WebAssembly (current Chrome, Edge, Firefox, or Safari should work; only Chrome was tested).
