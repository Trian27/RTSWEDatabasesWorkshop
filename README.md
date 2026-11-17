# Databases workshop

A 1-hour Road2SWE workshop on database design and SQL, built around a club-events database (clubs, events, students, RSVPs, plus the "old sheet" it replaces). Mentees run real PostgreSQL in their browser, with nothing to install. The instructor plan is in [INSTRUCTOR.md](INSTRUCTOR.md).

## What's here

| Path | What it is |
|---|---|
| `index.html`, `app.js`, `workshop.js` | The workshop page: SQL editor, tables, exercises with answer checking, "try to break it" |
| `sql/schema.sql` | The four tables and the old `signups_sheet` |
| `sql/seed.sql` | The data (generated; do not edit by hand) |
| `sql/exercises.sql` | The 14 exercises and their reference answers |
| `sql/break_it.sql` | Statements the design rejects, and the old sheet accepts |
| `scripts/generate_seed.py` | Generates `sql/seed.sql` deterministically |
| `slides/` | The slide deck and the script that builds it |
| `tests/` | Data, checker, and SQL tests |

## Open the workshop page

The page must be served over HTTP; opening `index.html` as a file does not work, because the browser blocks it from reading the SQL files. Each visitor downloads PostgreSQL (PGlite, about 4 MB compressed) from cdn.jsdelivr.net, so the network must allow that host.

- **For mentees:** host the folder with GitHub Pages. In the repository's Settings → Pages, choose "Deploy from a branch", pick the branch and the `/ (root)` folder, and the page is served at `https://<user>.github.io/<repo>/databases-workshop/`. On a free GitHub plan, Pages requires a public repository.
- **On your machine:** `cd databases-workshop && python3 -m http.server 8000`, then open http://localhost:8000.

## Load the data into your own PostgreSQL

```sh
createdb club_events
psql -d club_events -f sql/schema.sql -f sql/seed.sql
psql -d club_events -f sql/exercises.sql      # runs every reference answer
```

Running `schema.sql` again drops and recreates every table. To demo `break_it.sql` in psql, run `\set ON_ERROR_STOP off` first, because the errors are the point.

## Change the data or the exercises

- Data: edit the constants at the top of `scripts/generate_seed.py`, then run `python3 scripts/generate_seed.py` (standard library only). The same seed always produces the same file, and the script refuses to write if a fact the exercises rely on no longer holds.
- Exercises: edit `sql/exercises.sql`. Each exercise starts with `-- @exercise <n>` and needs `-- @level` and `-- @prompt`; `-- @hint`, `-- @live` (instructor demo), `-- @check shape` (compare row and column counts only), and `-- @sorted <column> asc|desc` are optional. The SQL below those lines is the reference answer.
- Slides: `npm install && npm run slides` rebuilds `slides/databases-workshop.pptx` from the current SQL files and data, so its numbers and SQL always match. Add `-- --page-url https://…` to print the hosted page link on the last slide.
- If you change the data, update the answer key in INSTRUCTOR.md and rebuild the slides.

## Run the tests

```sh
npm install
npm test
```

The tests load the SQL into the same PGlite version the page uses, check the facts the exercises rely on, run every reference answer and break-it statement, and cover the answer checker's edge cases.
