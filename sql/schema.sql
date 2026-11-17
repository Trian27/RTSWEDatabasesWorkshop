-- Club events database for the Road2SWE databases workshop.
-- Running this file again rebuilds every table from scratch (all data is lost).

DROP TABLE IF EXISTS rsvps;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS clubs;
DROP TABLE IF EXISTS signups_sheet;

-- One row per club. The name can never repeat.
CREATE TABLE clubs (
    club_id INTEGER PRIMARY KEY,
    name    VARCHAR(50) NOT NULL UNIQUE
);

-- One row per student, identified by NetID. Two students can share a name, never a NetID or email.
CREATE TABLE students (
    netid     VARCHAR(10)  PRIMARY KEY,
    name      VARCHAR(100) NOT NULL,
    email     VARCHAR(100) NOT NULL UNIQUE,
    grad_year INTEGER      NOT NULL
);

-- One row per event. club_id must point at a real club (one club hosts many events).
CREATE TABLE events (
    event_id   INTEGER      PRIMARY KEY,
    club_id    INTEGER      NOT NULL REFERENCES clubs (club_id),
    title      VARCHAR(100) NOT NULL,
    event_date DATE         NOT NULL,
    location   VARCHAR(100) NOT NULL,
    capacity   INTEGER      NOT NULL CHECK (capacity > 0)
);

-- One row per (student, event) sign-up: the link that lets many students attend many events.
-- The primary key makes signing up twice for the same event impossible.
CREATE TABLE rsvps (
    netid    VARCHAR(10) NOT NULL REFERENCES students (netid),
    event_id INTEGER     NOT NULL REFERENCES events (event_id),
    attended BOOLEAN     NOT NULL DEFAULT FALSE,
    PRIMARY KEY (netid, event_id)
);

-- The OLD design: one big spreadsheet, every column is free text, nothing is checked.
-- Kept only so we can see what goes wrong without a real design.
CREATE TABLE signups_sheet (
    netid         TEXT,
    student_name  TEXT,
    student_email TEXT,
    grad_year     TEXT,
    club_name     TEXT,
    event_title   TEXT,
    event_date    TEXT,
    location      TEXT,
    capacity      TEXT,
    attended      TEXT
);
