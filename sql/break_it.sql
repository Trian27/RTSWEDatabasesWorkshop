-- "Try to break it": mistakes the real design refuses, and the old sheet happily accepts.
-- The workshop page reads this file: "-- @expect <SQLSTATE>" is the error Postgres should raise
-- ("ok" means the statement succeeds), "-- @explain" is shown to mentees.
-- In psql, errors are the point, so let them through:  \set ON_ERROR_STOP off  then  \i sql/break_it.sql

-- @expect 23503
-- @explain Foreign key: no student has NetID zzz999, so Postgres refuses an RSVP for them.
INSERT INTO rsvps (netid, event_id) VALUES ('zzz999', 26);

-- @expect 23505
-- @explain Primary key: sk101 already RSVP'd to event 26 (Intro to Git), and the same sign-up cannot exist twice.
INSERT INTO rsvps (netid, event_id) VALUES ('sk101', 26);

-- @expect 23514
-- @explain Check constraint: an event cannot have a capacity of -5.
INSERT INTO events (event_id, club_id, title, event_date, location, capacity)
VALUES (999, 1, 'Negative Space Party', '2026-05-01', 'CoRE 101', -5);

-- @expect 23505
-- @explain Unique: a second student cannot reuse sk101's email.
INSERT INTO students (netid, name, email, grad_year) VALUES ('cc1', 'Copy Cat', 'sk101@example.edu', 2027);

-- @expect 23503
-- @explain Foreign key again: Chess Club still has events, so deleting the club would leave them pointing at nothing.
DELETE FROM clubs WHERE name = 'Chess Club';

-- @expect ok
-- @explain The old sheet accepts a sign-up for a NetID that belongs to nobody...
INSERT INTO signups_sheet (netid, event_title, attended) VALUES ('zzz999', 'Intro to Git', 'yes');

-- @expect ok
-- @explain ...a second Intro to Git sign-up for sk101...
INSERT INTO signups_sheet (netid, student_name, event_title) VALUES ('sk101', 'Scarlet Knight', 'Intro to Git');

-- @expect ok
-- @explain ...a capacity of -5 (or "lots": every column is just text)...
INSERT INTO signups_sheet (event_title, capacity) VALUES ('Negative Space Party', '-5');

-- @expect ok
-- @explain ...and deleting every Chess Club row, which silently throws away the club's whole history.
DELETE FROM signups_sheet WHERE club_name = 'Chess Club';
