# Instructor guide

A 60-minute workshop for mentees with little or no SQL. Read "The story" and "The data" first; they explain what the hour is building toward. The stage sections after them are the step-by-step script you follow in the room, and "Rehearse it yourself" shows how to run through all of it alone first.

You need two things open: the slides (`slides/databases-workshop.pptx`) and the workshop page (`index.html`, served as described in the README). Everything you show live, you show on the page.

Nothing runs on your laptop for the mentees. The host (GitHub Pages, for example) only hands out the page's files. Each mentee's browser then downloads the Postgres engine (PGlite) from jsDelivr and runs its own private database inside that tab, with its own copy of the data. If one mentee deletes a table, only their copy changes, and **Reset database** rebuilds it.

## The story

The hour is one story: **the club's sign-up sheet is a mess, so we learn the building blocks, design a database, prove the design prevents the mess, use it to answer questions, and then see where other kinds of databases fit.** Each stage answers the question the previous stage raised.

| Stage | Minutes | Slides | What happens | What mentees take away | It raises the question |
|---|---|---|---|---|---|
| 1. The problem | 0–5 | 1–3 | You run two queries on the old sign-up sheet. The room sees "USACS" next to "usacs" and a student with two emails. | A flat sheet lets the same fact be stored in conflicting ways. | What would we build instead, and how? |
| 2. The tools | 5–13 | 4–8 | You show the brief so they know what they'll design, then teach the building blocks on a made-up course-registration example: tables, rows, columns, primary keys, foreign keys, one-to-many, many-to-many (relationship tables), and the rules Postgres enforces. | The vocabulary and the two relationship patterns to design with. | Can you apply them to the club? |
| 3. They design it | 13–24 | 9–10 | Groups follow a five-step checklist to sketch the club database on paper, then two groups share. | They have applied the tools themselves before seeing an answer. | How does yours compare with the reference? |
| 4. Reveal, then break it | 24–29 | 11–12 | You show the four-table design, then try bad changes. Postgres refuses every one; the old sheet accepts the same mistakes. Mentees open the page. | The design, plus its rules, makes the stage 1 mistakes impossible. | The data is split into four tables now. How do we ask it questions? |
| 5. Queries | 29–48 | 13–16 | Three levels of SQL. You live-code one exercise per level, then mentees work through the rest on the page. | Read one table, put split tables back together (JOIN), summarize (GROUP BY). By exercise 11 they have answered the brief's three questions. | Is a table always the right shape? |
| 6. Beyond tables | 48–57 | 17–20 | A new feature where every sign-up form asks different questions: tables get awkward, MongoDB documents fit, but RSVPs stay in tables. Then one slide on four other databases. | Pick the kind of database by the shape of the data. | |
| 7. Wrap-up | 57–60 | 21 | Three takeaways and the link. | | |

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

The sheet row above becomes four rows in four tables. The `rsvps` row only says who, which event, and whether they came; the student's name, the event's room, and the club's name are each stored once, elsewhere. That split is why stage 5 needs JOIN. The course-registration example on slides 5–8 is made up for teaching and is not in the database.

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
| 112 names belong to 2 or more students (4 are called Chloe Ramirez) | Slide 5 and stage 3, if a group uses names as the identifier |

## Rehearse it yourself

About 30–40 minutes, alone, with the same slides and page you will use in the room.

1. Start the page: from the repository root, run `python3 -m http.server 8000`, then open http://localhost:8000 in Chrome. The status pill at the top should say **Ready · PostgreSQL 18.6** within a few seconds.
2. Open `slides/databases-workshop.pptx` in PowerPoint or Keynote, in presenter view so you see the speaker notes. Check that the bar charts on slides 15 and 16 draw.
3. Put the slides and the page side by side and go through Stages 1–7 below in order, doing every numbered step. Each step says what you should see.
4. Stage 3: spend 2 minutes sketching your own tables with the checklist on slide 9 instead of 8, then compare them with slide 11.
5. Stage 5: do every exercise yourself, not only the demos. Write your own query first; if you're stuck, press **Answer**, then **Put in editor**, **Run**, and **Check my result**.
6. Be wrong on purpose, so you know what mentees will see:
   - Exercise 9 without its `ORDER BY`, then **Check my result**: "Right rows, wrong order: sort by rsvp_count (largest first)."
   - `SELECT title, name FROM events JOIN clubs ON club_id = club_id;`: error 42702, ambiguous column (both tables have `club_id`).
   - `SELECT title, COUNT(*) FROM events;`: error 42803, grouping error.
   - `SELECT * FROM events WHERE title = Intro to Git;`: error 42601, syntax error (the text needs single quotes).
7. Press **Reset database** when you're done.

The page remembers your solved exercises in your browser, separately for each address. Mentees on the hosted link start with nothing solved. If you rehearse on the hosted link itself, the page you project will show your ticks.

## Before the workshop

- Host the page: push `main` and turn on GitHub Pages (README, "Open the workshop page"). The link is https://trian27.github.io/RTSWEDatabasesWorkshop/, and slide 21 already shows it. Open it on a laptop that isn't on your network and check that it reaches "Ready".
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

Don't explain the SQL yet; they learn it in stage 5. They only need to see what came back.

Transition: "These aren't typos you fix once. The sheet lets them happen. Next: what we'll build instead, and the tools to build it."

## Stage 2 · The tools (5–13 min, slides 4–8)

Goal: mentees get the vocabulary and the two relationship patterns before they design. The examples use a made-up course-registration database, so the club design is still theirs to work out.

1. **Slide 4.** Read the brief aloud:

   > USACS wants to replace its sign-up sheet. Students have a NetID, name, email, and graduation year. Clubs host events; each event has a title, date, location, and capacity. Students RSVP to events, and afterwards we record whether they actually came. Your design must answer: Which events are overbooked? Which club has the best turnout? Which events has a given student signed up for?

   Say they won't design yet: the box on the right lists the tools the next four slides teach.
2. **Slide 5 · Tables, rows, columns, and primary keys.** A table holds one kind of thing; a row is one of them (the highlighted course); a column is one fact about every row, with a type (credits is an INTEGER). A primary key names exactly one row. Ask: "Could two courses share a title? Could two students share a name?" The slide answers with the real data: 4 students are named Chloe Ramirez.
3. **Slide 6 · Foreign keys and one-to-many.** `courses.dept_id` holds a department's primary key, and the matching colors show which department each course belongs to. Postgres refuses a `dept_id` that doesn't exist. Rule of thumb: the foreign key goes on the many side, because a cell holds one value.
4. **Slide 7 · Many-to-many.** Ask first: "Where would you store which courses a student takes?" Let them hit the list-in-a-cell or `course1`, `course2` problem. The fix is `enrollments`: one row per (student, course) pair, a foreign key to each side, and the pair as its primary key, so no one enrolls twice. Facts about the pair, like the grade, live there.
5. **Slide 8 · Rules the database enforces.** Walk the five rows (PRIMARY KEY, REFERENCES, UNIQUE, NOT NULL, CHECK) and the CREATE TABLE that declares them. Every "What it stops" example is real: the slide build runs each one against Postgres and checks that it's refused.

Transition: "Now use these on the club."

## Stage 3 · They design it (13–24 min, slides 9–10)

Goal: mentees apply the tools to the club, so your reveal answers a question they already have.

1. **Slide 9.** The brief is on the left, and a five-step checklist on the right: list the things (one table each), list each table's columns, pick each primary key, connect related tables (a foreign key on the many side, or a relationship table), and add rules. Groups of 2–3, on paper, with an 8-minute timer.
2. **Walk around.** Use these prompts when you see a common design:

   | What you see | Ask | Where it leads |
   |---|---|---|
   | One big table | "A student changes their email. How many rows change? If the only RSVP for an event is cancelled, where does the event's room live now?" | Split students, events, and sign-ups into separate tables. |
   | An `attendees` column holding `"ab123, cd456"` | "How do you count RSVPs? Find everything sk101 signed up for? Stop a mistyped NetID?" | Students and events are many-to-many: a relationship table with one row per sign-up, `rsvps`. |
   | `event1`, `event2`, `event3` columns on students | "What about the student who goes to 40 events?" | Same: one row per sign-up. |
   | A sign-up table with no primary key | "What stops sk101 from RSVPing to the same event twice?" | Make the pair (`netid`, `event_id`) the primary key, like `enrollments` on slide 7. |
   | The student's name as the identifier | Run `SELECT name, COUNT(*) FROM students GROUP BY name HAVING COUNT(*) > 1;` on the page | 112 names belong to 2+ students (four Chloe Ramirezes). Use the NetID. |
   | The club name typed into each event | "The club renames itself. Now what?" | Clubs and events are one-to-many: a `club_id` foreign key on events. |
   | No attended column | "How do you tell an RSVP from someone who showed up?" | `attended` on the sign-up row, like the grade on an enrollment. |

3. **At about 21 minutes,** two groups with different designs share, one minute each.
4. **Slide 10** shows the four designs people usually draw and what breaks each one. Connect each to a group you saw.

Transition: "Here's the reference design."

## Stage 4 · Reveal, then try to break it (24–29 min, slides 11–12)

Goal: the room sees that the design, plus its rules, makes the stage 1 mistakes impossible.

1. **Slide 11.** Walk through the four tables as the stage 2 patterns applied to the club:
   - **One-to-many:** clubs → events, like departments → courses. Each event stores one `club_id`.
   - **Many-to-many:** students ↔ events through `rsvps`, the relationship table, like `enrollments`. `attended` is the fact about the pair, like the grade.

   The key point: Scarlet Knight's sheet row for Intro to Git is now stored in four places. The student is stored once in `students`, the event once in `events`, the club once in `clubs`, and the `rsvps` row only says (sk101, event 26, came). Optional, on the page: `SELECT * FROM rsvps WHERE netid = 'sk101';` returns 7 rows of just NetID, event id, and true/false.
2. **On the page, open the Try to break it tab** in the right column. For each of the first five statements, press **Put in editor**, ask the room "Will Postgres accept this?", press **Run**, and read the error aloud. Short on time? Run the first, second, and fifth.

   | Statement | You see |
   |---|---|
   | RSVP for NetID `zzz999` | Foreign key (23503): no such student |
   | sk101 RSVPs to Intro to Git again | Unique / primary key (23505): that (sk101, 26) pair already exists |
   | An event with capacity -5 | Check constraint (23514) |
   | A second student with sk101's email | Unique / primary key (23505) |
   | Delete Chess Club while it has events | Foreign key (23503): events still point at it |

3. **Run the four dashed "Old sheet accepts it" statements** the same way (or only the last one, if short on time). Each one succeeds. The last one says **DELETE · 910 rows affected**: Chess Club's entire history is gone and nothing stopped it.
4. **Press Reset database** (in the top bar). This undoes the sheet changes, which exercise 14 needs.
5. **Slide 12** recaps the refused and accepted columns side by side.
6. **Share the link.** Everyone opens it, and their status pill should turn to **Ready**.

Transition: "The data is split across four tables now. Next: how do we ask it questions?"

## Stage 5 · Queries (29–48 min, slides 13–16)

Goal: each level is a tool the design needs: read one table, put split tables back together, summarize. By the end, mentees have answered the brief's three questions.

**How the page checks answers.** The right column lists the 14 exercises by level. A mentee writes a query, presses **Run**, then presses **Check my result** on that exercise. Check compares their last result with the answer:

- The values must match.
- Column names and column order don't matter.
- If the exercise asks for an order, the order must match too.

A wrong answer gets a reason (wrong column count, wrong row count, wrong order, or one row that isn't in the answer), never the answer itself. **Hint** gives a nudge; **Answer** shows the reference SQL.

Each level follows the same rhythm: show the slide, live-code the exercise marked **Demo**, then let them work while you walk around.

### Level 1 · One table (29–34 min, slide 13, exercises 1–4)

1. **Slide 13.** Read the query clause by clause: SELECT picks columns, FROM picks the table, WHERE keeps rows, ORDER BY sorts, LIMIT caps the count.
2. **Live-code exercise 1.** Type `SELECT * FROM students LIMIT 10;`, press **Run**, then press **Check my result** on exercise 1. You see **Correct!** Doing this once on the projector shows them how Check works.
3. **Mentees do 2–4.** Things to say: text and dates go in single quotes (`'2025-10-01'`), and `COUNT(*)` counts the rows left after WHERE.

### Level 2 · Joins (34–41 min, slide 14, exercises 5–7)

1. **Slide 14.** The design split events from clubs; JOIN puts them back together. ON says which columns must be equal.
2. **Live-code exercise 5:**
   ```sql
   SELECT events.title, clubs.name
   FROM events
   JOIN clubs ON clubs.club_id = events.club_id;
   ```
   You see 120 rows, one per event, each with its club. Then show why the `table.` prefix matters: change the ON line to `ON club_id = club_id`, run it, and get error 42702 (ambiguous column).
3. **Mentees do 6 and 7.** Exercise 6, "which events did sk101 sign up for?", is the brief's third question. Exercise 7 needs three tables.

### Level 3 · Grouping (41–48 min, slides 15–16, exercises 8–11)

1. **Slide 15.** GROUP BY sorts rows into piles; COUNT(*) counts each pile; you get one output row per pile.
2. **Live-code exercise 8** (it's the query on slide 15). You see 8 rows, one per club; USACS hosted the most events, 22.
3. **Slide 16.** HAVING keeps only some groups. WHERE filters rows before grouping; HAVING filters groups after counting.
4. **Mentees do 9–11.**
   - Exercise 10 (overbooked events) is the brief's first question.
   - Exercise 11 (best turnout) is the brief's second question.
   - Exercise 9 must group by `event_id`, because titles repeat (there are 12 Weekly Chess Nights).
   - Error 42803 means a selected column is neither in the GROUP BY nor inside COUNT/SUM/AVG.

**Fast finishers:** exercises 12–14 are stretch goals: a LEFT JOIN, a two-condition HAVING, and a query back on the old sheet.

Close the stage at about 47 minutes: "Exercises 6, 10, and 11 are the three questions from the brief. Could your paper design have answered them?"

## Stage 6 · Beyond tables (48–57 min, slides 17–20)

Goal: one honest case where tables are awkward, why RSVPs still belong in tables, and a quick map of other databases. Nothing here runs; it's slides only.

1. **Slide 17.** New feature: each event's sign-up form asks its own questions. Hack Night wants shirt size, dietary restrictions (a list), GitHub handle, and team name. Resume Review wants major, resume link, and target roles. Poker Night asks nothing extra. Ask the room: "Where would these answers go in our four tables?" Then show the two attempts on the slide:
   - **A column per question:** mostly empty (NULL), a list doesn't fit in one cell, and every new question needs an `ALTER TABLE`.
   - **One row per answer:** every answer becomes text, and reading one registration back means reassembling rows.
2. **Slide 18.** In MongoDB, a `registrations` collection holds one document per registration, each carrying whatever answers its own form asked. A new question needs no schema change, and a list is just a list.
3. **Slide 19.** When each one fits. Documents fit records that each have their own shape and are read whole. Tables fit connected data that you join, count, and protect with rules. Ask: "Would you move RSVPs into MongoDB? How would you find the overbooked events?" Steer toward: you'd lose the foreign keys, and the JOIN plus GROUP BY that answered exercise 10. Mention that Postgres can also store documents, in a `JSONB` column.
4. **Slide 20 · Other databases you will hear about** (about 2 minutes, one line each):
   - **Elasticsearch / OpenSearch:** a search engine over JSON documents, behind search boxes and log search. OpenSearch is the open-source fork of Elasticsearch.
   - **DynamoDB:** Amazon's key-value database for huge amounts of data and fast lookups by key. It grew out of Amazon's Dynamo design, which spreads data around a consistent-hashing ring, the same idea as the Chord lookup protocol. Links to both papers are in the speaker notes.
   - **Splunk:** collects and searches logs and other machine data by time ("why did the site crash at 2 a.m.?").
   - **Neo4j:** a graph database. Following chains of connections ("friends of friends of friends") is fast, where SQL needs several JOINs.

   Close with the same lesson as MongoDB: pick the kind of database by the shape of the data and the questions you ask.

## Stage 7 · Wrap-up (57–60 min, slide 21)

Read the three takeaways on slide 21:

- Design decides which mistakes are even possible.
- JOIN connects tables, GROUP BY summarizes them, and constraints protect them.
- Pick the kind of database by the shape of your data and the questions you ask.

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
