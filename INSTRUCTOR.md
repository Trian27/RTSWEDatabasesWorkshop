# Instructor guide

A 60-minute workshop for mentees with little or no SQL. Read "The story" and "The data" first; they explain what the hour is building toward. The stage sections after them are the step-by-step script you follow in the room, and "Rehearse it yourself" shows how to run through all of it alone first.

You need two things open: the slides (`slides/databases-workshop.pptx`) and the workshop page (`index.html`, served as described in the README). Everything you show live, you show on the page.

Nothing runs on your laptop for the mentees. The host (GitHub Pages, for example) only hands out the page's files. Each mentee's browser then downloads the Postgres engine (PGlite) from jsDelivr and runs its own private database inside that tab, with its own copy of the data. If one mentee deletes a table, only their copy changes, and **Reset database** rebuilds it.

## The story

The hour is one story: **the club's sign-up sheet is a mess, so we design a database, prove the design prevents the mess, use it to answer questions, and then see one case where tables are awkward.** Each stage answers the question the previous stage raised.

| Stage | Minutes | Slides | What happens | What mentees take away | It raises the question |
|---|---|---|---|---|---|
| 1. The problem | 0–5 | 1–3 | You run two queries on the old sign-up sheet. The room sees "USACS" next to "usacs" and a student with two emails. | A flat sheet lets the same fact be stored in conflicting ways. | How would you organize this instead? |
| 2. They design it | 5–17 | 4–5 | Groups sketch tables on paper from a short brief, then two groups share. | They have wrestled with the problem before seeing an answer. | How would a database designer do it? |
| 3. Reveal, then break it | 17–25 | 6–8 | You show the four-table design, then try five bad changes. Postgres refuses every one; the old sheet accepts the same mistakes. Mentees open the page. | The design, plus the rules attached to it, makes the stage 1 mistakes impossible. | The data is split into four tables now. How do we ask it questions? |
| 4. Queries | 25–48 | 9–12 | Three levels of SQL. You live-code one exercise per level, then mentees work through the rest on the page. | Read one table, put split tables back together (JOIN), summarize (GROUP BY). By exercise 11 they have answered the brief's three questions. | Is a table always the right shape? |
| 5. When documents fit | 48–57 | 13–15 | A new feature where every sign-up form asks different questions. Tables get awkward; MongoDB documents fit. Then: should RSVPs move to MongoDB? No. | Pick tables or documents by the shape of the data. | |
| 6. Wrap-up | 57–60 | 16 | Three takeaways and the link. | | |

## The data

The same club sign-up information exists twice in the database: once as a messy spreadsheet, and once as a proper design.

### The old sheet: `signups_sheet` (9,362 rows)

This is "what the club uses today": one row per sign-up, with everything about the student and the event retyped on every row. Every column is free text and nothing is checked. One of Scarlet Knight's rows:

```
sk101 | Scarlet Knight | sk101@example.edu | 2027 | USACS | Intro to Git | 2025-10-16 | CoRE 101 | 80 | yes
```

Mistakes are planted in it on purpose, because stage 1 shows them:

- 8 clubs appear under 10 names: `usacs` (12 rows) next to `USACS`, and `Chess club` (8 rows) next to `Chess Club`.
- 6 students have two different emails. Aisha Bailey (`ab336`) is both `ab336@example.edu` and `aisha.bailey@example.com`.
- 3 events are listed in two rooms at once (LeetCode Night on 2026-02-26 is in both Hill 114 and Voorhees Mall).
- 5 sign-ups are entered twice.

### The design: four tables

The same information split so each fact is stored once:

```
clubs ──< events ──< rsvps >── students
  8        120       9,357      1,200 rows

──<  means "one to many": one club has many events; one event has many RSVPs
```

| Table | One row is | Example row | Key columns |
|---|---|---|---|
| `clubs` | a club | `1, USACS` | `club_id` identifies the club |
| `events` | an event | `26, 1, Intro to Git, 2025-10-16, CoRE 101, 80` | `event_id` identifies the event; `club_id` = 1 points at USACS |
| `students` | a student | `sk101, Scarlet Knight, sk101@example.edu, 2027` | `netid` identifies the student; `email` must be unique |
| `rsvps` | one student signing up for one event | `sk101, 26, true` | the pair (`netid`, `event_id`) identifies the sign-up; `attended` says whether they came |

The sheet row above becomes four rows in four tables. The `rsvps` row only says who, which event, and whether they came; the student's name, the event's room, and the club's name are each stored once, elsewhere. That split is why stage 4 needs JOIN.

### Facts planted for the exercises

The data is generated (see README), but these facts are fixed so every exercise has a clean, discussable answer:

| Fact | Used in |
|---|---|
| Scarlet Knight (`sk101`) has exactly 7 RSVPs, including Intro to Git (event 26), and came to 6 | Exercises 6 and 7, the break-it demo |
| Exactly 3 events have more RSVPs than seats (Fall Hack Night: 221 RSVPs for 200 seats) | Exercise 10 |
| Turnout differs by club: Robotics Club 84% of RSVPs came, Photography Club 56% | Exercise 11 |
| Exactly 1 event has zero RSVPs (Sunrise Photo Walk) | Exercise 12 |
| Exactly 15 students RSVP'd 3 or more times and never came | Exercise 13 |
| The sheet's mistakes listed above | Stage 1 and exercise 14 |
| 112 names belong to 2 or more students (4 are called Chloe Ramirez) | Stage 2, if a group uses names as the identifier |

## Rehearse it yourself

About 30–40 minutes, alone, with the same slides and page you will use in the room.

1. Start the page: from the repository root, run `python3 -m http.server 8000`, then open http://localhost:8000 in Chrome. The status pill at the top should say **Ready · PostgreSQL 18.6** within a few seconds.
2. Open `slides/databases-workshop.pptx` in PowerPoint or Keynote, in presenter view so you see the speaker notes. Check that the bar charts on slides 11 and 12 draw.
3. Put the slides and the page side by side and go through Stages 1–6 below in order, doing every numbered step. Each step says what you should see.
4. Stage 2: spend 2 minutes sketching your own tables from the brief instead of 10, then compare them with slide 6.
5. Stage 4: do every exercise yourself, not only the demos. Write your own query first; if you're stuck, press **Answer**, then **Put in editor**, **Run**, and **Check my result**.
6. Be wrong on purpose, so you know what mentees will see:
   - Exercise 9 without its `ORDER BY`, then **Check my result**: "Right rows, wrong order: sort by rsvp_count (largest first)."
   - `SELECT title, name FROM events JOIN clubs ON club_id = club_id;`: error 42702, ambiguous column (both tables have `club_id`).
   - `SELECT title, COUNT(*) FROM events;`: error 42803, grouping error.
   - `SELECT * FROM events WHERE title = Intro to Git;`: error 42601, syntax error (the text needs single quotes).
7. Press **Reset database** when you're done.

The page remembers your solved exercises in your browser, separately for each address. Mentees on the hosted link start with nothing solved. If you rehearse on the hosted link itself, the page you project will show your ticks.

## Before the workshop

- Host the page: push `main` and turn on GitHub Pages (README, "Open the workshop page"). The link is https://trian27.github.io/RTSWEDatabasesWorkshop/, and slide 16 already shows it. Open it on a laptop that isn't on your network and check that it reaches "Ready".
- Have the link ready to paste in the group chat.
- Make the page's text large enough for the back row (browser zoom, Ctrl/Cmd +).
- Optional: if you'd rather project psql than the page, load the data first with `createdb club_events && psql -d club_events -f sql/schema.sql -f sql/seed.sql`. For the break-it demo in psql, run `\set ON_ERROR_STOP off` first.

## Stage 1 · The problem (0–5 min, slides 1–3)

Goal: the room sees that a flat sheet lets one fact be stored in conflicting ways.

1. **Slide 1.** One sentence: "Today we'll design a database for club events, ask it questions with SQL, and see one case where a different kind of database fits better."
2. **Slide 2** shows four of Aisha Bailey's rows from the sheet. Say: "This is how the club tracks sign-ups today: one big sheet, one row per sign-up." Point at the email column. Ask: "Which email is right? If she changes it again, how many rows do you edit?"
3. **Slide 3**, then switch to the page and run the query from the slide live. Paste it into the editor and press **Run** (or Ctrl/Cmd+Enter):
   ```sql
   SELECT DISTINCT club_name FROM signups_sheet ORDER BY club_name;
   ```
   You see 10 rows, with `Chess club` next to `Chess Club` and `usacs` next to `USACS`. Say: "We have 8 clubs."
4. Optionally run the email check too:
   ```sql
   SELECT netid, COUNT(DISTINCT student_email) AS emails
   FROM signups_sheet
   GROUP BY netid
   HAVING COUNT(DISTINCT student_email) > 1;
   ```
   You see 6 rows, with `ab336` (Aisha) first.
5. Back to slide 3 for the totals: 10 spellings, 6 students with two emails, 3 events in two rooms at once, 5 sign-ups entered twice.

Don't explain the SQL yet; they learn it in stage 4. They only need to see what came back.

Transition: "These aren't typos you fix once. The sheet lets them happen. Your job now: design something that doesn't."

## Stage 2 · They design it (5–17 min, slides 4–5)

Goal: mentees try the design themselves first, so your reveal answers a question they already have.

1. **Slide 4.** Read the brief aloud. Groups of 2–3, on paper, with a 10-minute timer. Ask for three things: the tables, the columns in each, and which column identifies a row. (That column is the primary key, but don't name it yet.)
2. **Walk around.** Use these prompts when you see a common design:

   | What you see | Ask | Where it leads |
   |---|---|---|
   | One big table | "A student changes their email. How many rows change? If the only RSVP for an event is cancelled, where does the event's room live now?" | Split students, events, and sign-ups into separate tables. |
   | An `attendees` column holding `"ab123, cd456"` | "How do you count RSVPs? Find everything sk101 signed up for? Stop a mistyped NetID?" | One row per sign-up: the `rsvps` table. |
   | `event1`, `event2`, `event3` columns on students | "What about the student who goes to 40 events?" | Same: one row per sign-up. |
   | The student's name as the identifier | Run `SELECT name, COUNT(*) FROM students GROUP BY name HAVING COUNT(*) > 1;` on the page | 112 names belong to 2+ students (four Chloe Ramirezes). Use the NetID. |
   | The club name typed into each event | "The club renames itself. Now what?" | A `club_id` pointing at a `clubs` table. |
   | No attended column | "How do you tell an RSVP from someone who showed up?" | `attended` on the sign-up row. |

3. **At about 15 minutes,** two groups with different designs share, one minute each.
4. **Slide 5** shows the four designs people usually draw and what breaks each one. Connect each to a group you saw.

Transition: "Here's how a database designer would split this up."

## Stage 3 · Reveal, then try to break it (17–25 min, slides 6–8)

Goal: the room sees that the design, plus the rules attached to it, makes the stage 1 mistakes impossible.

1. **Slide 6.** Walk through the four tables. The key point: Scarlet Knight's sheet row for Intro to Git is now stored in four places. The student is stored once in `students`, the event once in `events`, the club once in `clubs`, and the `rsvps` row only says (sk101, event 26, came). Name the two relationships:
   - **One-to-many:** a club hosts many events, and each event stores one `club_id`.
   - **Many-to-many:** students go to many events and events have many students, connected through `rsvps`.

   Optional, on the page: `SELECT * FROM rsvps WHERE netid = 'sk101';` returns 7 rows of just NetID, event id, and true/false.
2. **Slide 7.** Keys are rules Postgres enforces:
   - **Primary key:** one value, one row.
   - **Foreign key:** the value must match a real row in another table.
   - **Two-column key:** the pair must be unique, so the same RSVP can't exist twice.
3. **On the page, open the Try to break it tab** in the right column. For each of the first five statements, press **Put in editor**, ask the room "Will Postgres accept this?", press **Run**, and read the error aloud:

   | Statement | You see |
   |---|---|
   | RSVP for NetID `zzz999` | Foreign key (23503): no such student |
   | sk101 RSVPs to Intro to Git again | Unique / primary key (23505): that (sk101, 26) pair already exists |
   | An event with capacity -5 | Check constraint (23514) |
   | A second student with sk101's email | Unique / primary key (23505) |
   | Delete Chess Club while it has events | Foreign key (23503): events still point at it |

4. **Run the four dashed "Old sheet accepts it" statements** the same way. Each one succeeds. The last one says **DELETE · 910 rows affected**: Chess Club's entire history is gone and nothing stopped it.
5. **Press Reset database** (in the top bar). This undoes the sheet changes, which exercise 14 needs.
6. **Slide 8** recaps the refused and accepted columns side by side.
7. **Share the link.** Everyone opens it, and their status pill should turn to **Ready**.

Transition: "The data is split across four tables now. Next: how do we ask it questions?"

## Stage 4 · Queries (25–48 min, slides 9–12)

Goal: each level is a tool the design needs: read one table, put split tables back together, summarize. By the end, mentees have answered the brief's three questions.

**How the page checks answers.** The right column lists the 14 exercises by level. A mentee writes a query, presses **Run**, then presses **Check my result** on that exercise. Check compares their last result with the answer:

- The values must match.
- Column names and column order don't matter.
- If the exercise asks for an order, the order must match too.

A wrong answer gets a reason (wrong column count, wrong row count, wrong order, or one row that isn't in the answer), never the answer itself. **Hint** gives a nudge; **Answer** shows the reference SQL.

Each level follows the same rhythm: show the slide, live-code the exercise marked **Demo**, then let them work while you walk around.

### Level 1 · One table (25–31 min, slide 9, exercises 1–4)

1. **Slide 9.** Read the query clause by clause: SELECT picks columns, FROM picks the table, WHERE keeps rows, ORDER BY sorts, LIMIT caps the count.
2. **Live-code exercise 1.** Type `SELECT * FROM students LIMIT 10;`, press **Run**, then press **Check my result** on exercise 1. You see **Correct!** Doing this once on the projector shows them how Check works.
3. **Mentees do 2–4.** Things to say: text and dates go in single quotes (`'2025-10-01'`), and `COUNT(*)` counts the rows left after WHERE.

### Level 2 · Joins (31–39 min, slide 10, exercises 5–7)

1. **Slide 10.** The design split events from clubs; JOIN puts them back together. ON says which columns must be equal.
2. **Live-code exercise 5:**
   ```sql
   SELECT events.title, clubs.name
   FROM events
   JOIN clubs ON clubs.club_id = events.club_id;
   ```
   You see 120 rows, one per event, each with its club. Then show why the `table.` prefix matters: change the ON line to `ON club_id = club_id`, run it, and get error 42702 (ambiguous column).
3. **Mentees do 6 and 7.** Exercise 6, "which events did sk101 sign up for?", is the brief's third question. Exercise 7 needs three tables.

### Level 3 · Grouping (39–48 min, slides 11–12, exercises 8–11)

1. **Slide 11.** GROUP BY sorts rows into piles; COUNT(*) counts each pile; you get one output row per pile.
2. **Live-code exercise 8** (it's the query on slide 11). You see 8 rows, one per club; USACS hosted the most events, 22.
3. **Slide 12.** HAVING keeps only some groups. WHERE filters rows before grouping; HAVING filters groups after counting.
4. **Mentees do 9–11.**
   - Exercise 10 (overbooked events) is the brief's first question.
   - Exercise 11 (best turnout) is the brief's second question.
   - Exercise 9 must group by `event_id`, because titles repeat (there are 12 Weekly Chess Nights).
   - Error 42803 means a selected column is neither in the GROUP BY nor inside COUNT/SUM/AVG.

**Fast finishers:** exercises 12–14 are stretch goals: a LEFT JOIN, a two-condition HAVING, and a query back on the old sheet.

Close the stage at about 47 minutes: "Exercises 6, 10, and 11 are the three questions from the brief. Could your paper design have answered them?"

## Stage 5 · When documents fit (48–57 min, slides 13–15)

Goal: one honest case where tables are awkward, and why RSVPs still belong in tables. MongoDB is only on the slides; nothing runs.

1. **Slide 13.** New feature: each event's sign-up form asks its own questions. Hack Night wants shirt size, dietary restrictions (a list), GitHub handle, and team name. Resume Review wants major, resume link, and target roles. Poker Night asks nothing extra. Ask the room: "Where would these answers go in our four tables?" Then show the two attempts on the slide:
   - **A column per question:** mostly empty (NULL), a list doesn't fit in one cell, and every new question needs an `ALTER TABLE`.
   - **One row per answer:** every answer becomes text, and reading one registration back means reassembling rows.
2. **Slide 14.** In MongoDB, a `registrations` collection holds one document per registration, each carrying whatever answers its own form asked. A new question needs no schema change, and a list is just a list.
3. **Slide 15.** When each one fits. Documents fit records that each have their own shape and are read whole. Tables fit connected data that you join, count, and protect with rules. Ask: "Would you move RSVPs into MongoDB? How would you find the overbooked events?" Steer toward: you'd lose the foreign keys, and the JOIN plus GROUP BY that answered exercise 10. Mention that Postgres can also store documents, in a `JSONB` column.

## Stage 6 · Wrap-up (57–60 min, slide 16)

Read the three takeaways on slide 16:

- Design decides which mistakes are even possible.
- JOIN connects tables, GROUP BY summarizes them, and constraints protect them.
- Pick tables or documents by the shape of the data.

Remind them the page stays up for practice, and **Reset database** rebuilds it anytime.

## Answer key

Reference SQL for every exercise is in `sql/exercises.sql`; the page's Answer button shows the same SQL.

| # | Level | Question | Rows | What to expect |
|---|---|---|---|---|
| 1 | One table (Demo) | 10 students | 10 | Any 10 students (only the row and column counts are checked) |
| 2 | One table | October 2025 events, earliest first | 17 | Starts with Quant Interview Prep on 2025-10-01 |
| 3 | One table | Students graduating in 2028 | 1 | 297 |
| 4 | One table | Events with capacity over 100 | 30 | |
| 5 | Joins (Demo) | Each event with its club | 120 | |
| 6 | Joins | sk101's events (brief question 3) | 7 | Includes Intro to Git |
| 7 | Joins | Who attended Intro to Git | 59 | 78 RSVP'd, 59 came |
| 8 | Grouping (Demo) | Events per club | 8 | USACS hosted the most (22) |
| 9 | Grouping | RSVPs per event, most popular first | 119 | Robot Battle Showcase on 2025-12-12 (244) |
| 10 | Grouping | Overbooked events (brief question 1) | 3 | Fall Hack Night 221/200, Freeroll Poker Tournament 89/80, Resume Review with Alumni 46/40 |
| 11 | Grouping | Turnout per club (brief question 2) | 8 | Robotics Club best (0.84), Photography Club worst (0.56) |
| 12 | Stretch | Event with zero RSVPs | 1 | Sunrise Photo Walk |
| 13 | Stretch | RSVP'd 3+ times, never came | 15 | |
| 14 | Stretch | NetIDs with two emails in the sheet | 6 | The same six students from stage 1 |

## If something goes wrong

| Problem | Fix |
|---|---|
| The page shows "Could not download Postgres" | Wifi or jsDelivr is blocked for that laptop. Pair the mentee with a neighbor whose page works. |
| The page says to open it through a web server | Someone opened `index.html` as a file. Send them the hosted link. |
| A mentee broke their data (dropped a table, deleted rows) | Press **Reset database**. It rebuilds everything in a few seconds. |
| The tab freezes | Usually a join without ON (`FROM events, rsvps` is 1.1 million rows). Reload the page. |
| Check says wrong but the result looks right | Read the reason: column count, row count, order, or one row that differs. Rounding differences under 0.005 are accepted. |
| A Postgres error a mentee doesn't understand | The page explains the common error codes under the message. |

The page was tested in Chrome only. Any current browser with WebAssembly should work (Edge, Firefox, Safari), but none of them has been tested.
