"""Generate sql/seed.sql for the databases workshop.

The output is deterministic: the same SEED always produces a byte-identical file, so the
browser page, local Postgres, and the tests all see exactly the same data.

Besides realistic-looking random data, the generator plants the specific facts that the
exercises, slides, and instructor run sheet rely on (overbooked events, a zero-RSVP event,
a featured student, no-show students, and anomalies in the old flat sheet). Every planted
fact is validated before the file is written.

Usage:
    python3 scripts/generate_seed.py [output_path]   # default: sql/seed.sql
"""

from __future__ import annotations

import random
import sys
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

SEED = 2026
DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "sql" / "seed.sql"
INSERT_BATCH_SIZE = 500

STUDENT_COUNT = 1200
GRAD_YEAR_WEIGHTS = {2026: 0.22, 2027: 0.26, 2028: 0.27, 2029: 0.25}
EMAIL_DOMAIN = "example.edu"
OLD_EMAIL_DOMAIN = "example.com"
NETID_MAX_NUMBER = 999

# How many clubs a student follows, and how strongly they stick to those clubs.
CLUBS_FOLLOWED_WEIGHTS = {1: 0.45, 2: 0.35, 3: 0.20}
FOLLOWED_CLUB_WEIGHT = 1.0
OTHER_CLUB_WEIGHT = 0.08
# Relative activity levels (0 = never RSVPs) and how often a student shows up after RSVPing.
ACTIVITY_WEIGHTS = {0.0: 0.10, 0.3: 0.18, 0.6: 0.22, 1.0: 0.27, 1.6: 0.15, 2.5: 0.08}
SHOW_UP_WEIGHTS = {0.95: 0.25, 0.85: 0.30, 0.70: 0.25, 0.50: 0.12, 0.30: 0.08}
# Fraction of capacity filled by RSVPs for an ordinary event.
FILL_RANGE = (0.75, 1.0)

SEMESTERS = {
    "fall": (date(2025, 9, 3), date(2025, 12, 12)),
    "spring": (date(2026, 1, 21), date(2026, 4, 29)),
}
ANY_SEMESTER = "any"
# No events during breaks (inclusive ranges).
BREAKS = [
    (date(2025, 11, 26), date(2025, 11, 30)),  # Thanksgiving recess
    (date(2026, 3, 14), date(2026, 3, 22)),    # Spring break
]

FEATURED_STUDENT = ("sk101", "Scarlet Knight", 2027)
FEATURED_RSVP_COUNT = 7
INTRO_TO_GIT = "Intro to Git"
ZERO_RSVP_EVENT = "Sunrise Photo Walk"
OVERBOOKED_EXTRA = {"Fall Hack Night": 21, "Freeroll Poker Tournament": 9, "Resume Review with Alumni": 6}
NO_SHOW_COUNT = 15
NO_SHOW_MIN_RSVPS = 3

# Anomalies planted in the old flat sheet.
EMAIL_CHANGE_COUNT = 6
EMAIL_CHANGE_MIN_RSVPS = 4
ROOM_MOVE_COUNT = 3
ROOM_MOVE_MIN_RSVPS = 10
MISSPELLINGS = {"USACS": ("usacs", 12), "Chess Club": ("Chess club", 8)}
DUPLICATE_SIGNUP_COUNT = 5

# (name, popularity, turnout factor) in club_id order. The turnout factor scales each student's
# chance of showing up, so "which club has the best turnout?" has a clear answer.
CLUBS = [
    ("USACS", 3.0, 1.00),
    ("Chess Club", 1.0, 1.12),
    ("Quant Club", 1.3, 0.92),
    ("Poker Club", 1.2, 1.05),
    ("Robotics Club", 0.9, 1.20),
    ("Data Science Club", 1.4, 0.88),
    ("Game Dev Club", 1.0, 0.97),
    ("Photography Club", 0.8, 0.72),
]
MAX_SHOW_UP_PROBABILITY = 0.98

# (club, title, location, capacity, occurrences, semester)
EVENT_PLAN = [
    ("USACS", "Intro to Git", "CoRE 101", 80, 1, "fall"),
    ("USACS", "Fall Hack Night", "Busch Student Center MPR", 200, 1, "fall"),
    ("USACS", "Spring Hack Night", "Busch Student Center MPR", 200, 1, "spring"),
    ("USACS", "Resume Review with Alumni", "CoRE 301", 40, 1, ANY_SEMESTER),
    ("USACS", "Tech Talk", "CoRE 101", 200, 6, ANY_SEMESTER),
    ("USACS", "LeetCode Night", "Hill 114", 80, 8, ANY_SEMESTER),
    ("USACS", "Internship Panel", "CoRE 101", 150, 2, ANY_SEMESTER),
    ("USACS", "Linux Install Fest", "Hill 120", 60, 1, "fall"),
    ("USACS", "Databases Workshop", "CoRE 101", 80, 1, "spring"),
    ("Chess Club", "Weekly Chess Night", "Livingston Student Center 202B", 70, 12, ANY_SEMESTER),
    ("Chess Club", "Blitz Tournament", "Livingston Student Center 202B", 64, 3, ANY_SEMESTER),
    ("Chess Club", "Chess Openings Workshop", "Tillett 207", 40, 1, ANY_SEMESTER),
    ("Quant Club", "Intro to Options", "SEC 118", 120, 1, "fall"),
    ("Quant Club", "Probability Puzzle Night", "Hill 114", 80, 6, ANY_SEMESTER),
    ("Quant Club", "Trading Competition", "SEC 118", 150, 2, ANY_SEMESTER),
    ("Quant Club", "Quant Interview Prep", "Hill 120", 100, 5, ANY_SEMESTER),
    ("Poker Club", "Poker Night", "College Ave Student Center 411", 120, 10, ANY_SEMESTER),
    ("Poker Club", "Freeroll Poker Tournament", "College Ave Student Center 411", 80, 1, "spring"),
    ("Poker Club", "Poker Math Workshop", "SEC 118", 60, 3, ANY_SEMESTER),
    ("Robotics Club", "Build Night", "Weeks Hall 102", 50, 8, ANY_SEMESTER),
    ("Robotics Club", "Arduino Workshop", "Weeks Hall 102", 60, 2, ANY_SEMESTER),
    ("Robotics Club", "Robot Battle Showcase", "Busch Student Center MPR", 250, 2, ANY_SEMESTER),
    ("Data Science Club", "Kaggle Night", "Hill 114", 80, 6, ANY_SEMESTER),
    ("Data Science Club", "Intro to Pandas", "Hill 120", 120, 2, ANY_SEMESTER),
    ("Data Science Club", "ML Paper Reading", "CoRE 301", 40, 5, ANY_SEMESTER),
    ("Data Science Club", "Data Viz Showcase", "CoRE 101", 150, 1, "spring"),
    ("Game Dev Club", "Game Jam Kickoff", "Busch Student Center MPR", 150, 2, ANY_SEMESTER),
    ("Game Dev Club", "Unity Workshop", "Tillett 207", 60, 4, ANY_SEMESTER),
    ("Game Dev Club", "Playtest Night", "Tillett 207", 60, 6, ANY_SEMESTER),
    ("Photography Club", "Photo Walk", "Voorhees Mall", 60, 8, ANY_SEMESTER),
    ("Photography Club", ZERO_RSVP_EVENT, "Voorhees Mall", 30, 1, "spring"),
    ("Photography Club", "Lightroom Basics", "College Ave Student Center 411", 60, 3, ANY_SEMESTER),
    ("Photography Club", "Portrait Night", "College Ave Student Center 411", 40, 4, ANY_SEMESTER),
]
EXPECTED_EVENT_COUNT = 120

ALL_LOCATIONS = sorted({plan[2] for plan in EVENT_PLAN})

FIRST_NAMES = """Aarav Abigail Adrian Aisha Alejandro Alex Amara Andre Anika Arjun Ava Benjamin Bianca
Brandon Camila Carlos Chloe Daniel David Deja Diego Elena Elijah Emily Ethan Fatima Gabriel Grace
Hannah Hiro Isabella Isaiah Jacob Jada James Jasmine Javier Jin Jordan Joseph Julia Kai Kavya Kevin
Layla Leah Liam Lucas Malik Maya Mei Michael Mohammed Nadia Naomi Nathan Neha Noah Olivia Omar Priya
Rahul Rebecca Ricardo Riya Ryan Samuel Sara Sebastian Sofia Tariq Thomas Valentina Victor Wei Xavier
Yara Yusuf Zara Zoe""".split()

LAST_NAMES = """Adams Ahmed Alvarez Bailey Banerjee Brooks Chen Cohen Cruz Das Davis Diaz Edwards Evans
Fernandez Fischer Garcia Gonzalez Gupta Hall Harris Hernandez Hughes Iyer Jackson Jain Johnson Kaur
Khan Kim Kowalski Kumar Lee Lewis Li Lopez Martin Martinez Mehta Miller Mitchell Moore Morales Murphy
Nguyen Novak Okafor Ortiz Park Patel Perez Phillips Price Ramirez Reddy Reyes Rivera Robinson
Rodriguez Rossi Russo Sanchez Shah Singh Smith Sullivan Tanaka Taylor Thomas Torres Tran Turner
Walker Wang Washington Williams Wilson Wong Wu Zhang""".split()

NETID_MIDDLE_INITIAL_PROBABILITY = 0.4


@dataclass
class Student:
    """A student row plus the hidden traits that drive their RSVPs."""

    netid: str
    first: str
    last: str
    grad_year: int
    activity: float = 0.0
    show_up: float = 0.0
    club_weights: dict[str, float] = field(default_factory=dict)

    @property
    def name(self) -> str:
        return f"{self.first} {self.last}"

    @property
    def email(self) -> str:
        return f"{self.netid}@{EMAIL_DOMAIN}"


@dataclass
class Event:
    """An event row."""

    event_id: int
    club: str
    title: str
    event_date: date
    location: str
    capacity: int


@dataclass
class Rsvp:
    """A sign-up of one student for one event."""

    netid: str
    event_id: int
    attended: bool = False


def weighted_choice(rng: random.Random, weights: dict) -> object:
    """Pick one key of `weights` with probability proportional to its value."""
    keys = list(weights)
    return rng.choices(keys, weights=[weights[k] for k in keys], k=1)[0]


def weighted_sample_without_replacement(rng: random.Random, items: list, weights: list[float], k: int) -> list:
    """Pick k distinct items, each draw proportional to weight (Efraimidis-Spirakis keys)."""
    keyed = [(rng.random() ** (1.0 / w), i) for i, w in enumerate(weights) if w > 0]
    if len(keyed) < k:
        raise ValueError(f"Need {k} distinct students but only {len(keyed)} are eligible; lower capacities.")
    keyed.sort(reverse=True)
    return [items[i] for _, i in keyed[:k]]


def make_students(rng: random.Random) -> list[Student]:
    """Create STUDENT_COUNT students with unique NetIDs; the featured student comes first."""
    featured_netid, featured_name, featured_year = FEATURED_STUDENT
    first, last = featured_name.split()
    students = [Student(featured_netid, first, last, featured_year)]
    used_netids = {featured_netid}
    while len(students) < STUDENT_COUNT:
        first, last = rng.choice(FIRST_NAMES), rng.choice(LAST_NAMES)
        middle = rng.choice("abcdefghijklmnoprstw") if rng.random() < NETID_MIDDLE_INITIAL_PROBABILITY else ""
        netid = f"{first[0]}{middle}{last[0]}".lower() + str(rng.randint(1, NETID_MAX_NUMBER))
        if netid in used_netids:
            continue
        used_netids.add(netid)
        students.append(Student(netid, first, last, weighted_choice(rng, GRAD_YEAR_WEIGHTS)))

    club_popularity = {name: popularity for name, popularity, _ in CLUBS}
    for student in students[1:]:
        student.activity = weighted_choice(rng, ACTIVITY_WEIGHTS)
        student.show_up = weighted_choice(rng, SHOW_UP_WEIGHTS)
        followed_count = weighted_choice(rng, CLUBS_FOLLOWED_WEIGHTS)
        followed = set(weighted_sample_without_replacement(
            rng, list(club_popularity), list(club_popularity.values()), followed_count))
        student.club_weights = {
            club: FOLLOWED_CLUB_WEIGHT if club in followed else OTHER_CLUB_WEIGHT for club in club_popularity
        }
    return students


def semester_weekdays(semester: str) -> list[date]:
    """All Monday-Friday dates in one semester, or both semesters for ANY_SEMESTER."""
    names = list(SEMESTERS) if semester == ANY_SEMESTER else [semester]
    days = []
    for name in names:
        start, end = SEMESTERS[name]
        day = start
        while day <= end:
            if day.weekday() < 5 and not any(start <= day <= end for start, end in BREAKS):
                days.append(day)
            day += timedelta(days=1)
    return days


def make_events(rng: random.Random) -> list[Event]:
    """Place every planned event on a weekday; event_id follows date order."""
    drafts = []
    for club, title, location, capacity, occurrences, semester in EVENT_PLAN:
        for event_date in rng.sample(semester_weekdays(semester), occurrences):
            drafts.append((event_date, club, title, location, capacity))
    if len(drafts) != EXPECTED_EVENT_COUNT:
        raise ValueError(f"EVENT_PLAN yields {len(drafts)} events, expected {EXPECTED_EVENT_COUNT}.")
    drafts.sort(key=lambda d: (d[0], d[1], d[2]))
    return [Event(i, club, title, day, location, capacity)
            for i, (day, club, title, location, capacity) in enumerate(drafts, start=1)]


def unique_event(events: list[Event], title: str) -> Event:
    """Return the single event with this title, failing loudly if the plan made it non-unique."""
    matches = [e for e in events if e.title == title]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one event titled {title!r}, found {len(matches)}.")
    return matches[0]


def make_rsvps(rng: random.Random, students: list[Student], events: list[Event]) -> list[Rsvp]:
    """Sample sign-ups per event, then plant the featured student, no-shows, and attendance."""
    featured = students[0]
    others = students[1:]
    planted_titles = set(OVERBOOKED_EXTRA) | {ZERO_RSVP_EVENT, INTRO_TO_GIT}
    intro_to_git = unique_event(events, INTRO_TO_GIT)
    ordinary = [e for e in events if e.title not in planted_titles]
    featured_events = {intro_to_git.event_id} | {
        e.event_id for e in rng.sample(ordinary, FEATURED_RSVP_COUNT - 1)}

    rsvps: list[Rsvp] = []
    for event in events:
        if event.title == ZERO_RSVP_EVENT:
            continue
        if event.title in OVERBOOKED_EXTRA:
            count = event.capacity + OVERBOOKED_EXTRA[event.title]
        else:
            count = min(event.capacity, round(event.capacity * rng.uniform(*FILL_RANGE)))
            if event.event_id in featured_events:
                count = min(count, event.capacity - 1)
        weights = [s.activity * s.club_weights[event.club] for s in others]
        for student in weighted_sample_without_replacement(rng, others, weights, count):
            rsvps.append(Rsvp(student.netid, event.event_id))

    by_netid = {s.netid: s for s in students}
    by_event = {e.event_id: e for e in events}
    turnout_factor = {name: factor for name, _, factor in CLUBS}
    for rsvp in rsvps:
        factor = turnout_factor[by_event[rsvp.event_id].club]
        rsvp.attended = rng.random() < min(MAX_SHOW_UP_PROBABILITY, by_netid[rsvp.netid].show_up * factor)

    featured_skipped = rng.choice(sorted(featured_events - {intro_to_git.event_id}))
    for event_id in sorted(featured_events):
        rsvps.append(Rsvp(featured.netid, event_id, attended=event_id != featured_skipped))

    plant_no_shows(rng, rsvps, featured.netid)
    rsvps.sort(key=lambda r: (r.event_id, r.netid))
    return rsvps


def plant_no_shows(rng: random.Random, rsvps: list[Rsvp], featured_netid: str) -> None:
    """Make exactly NO_SHOW_COUNT frequent RSVPers never attend; everyone else frequent attends once."""
    by_student: dict[str, list[Rsvp]] = {}
    for rsvp in rsvps:
        by_student.setdefault(rsvp.netid, []).append(rsvp)
    frequent = sorted(n for n, rs in by_student.items() if len(rs) >= NO_SHOW_MIN_RSVPS and n != featured_netid)
    no_shows = set(rng.sample(frequent, NO_SHOW_COUNT))
    for netid in frequent:
        student_rsvps = by_student[netid]
        if netid in no_shows:
            for rsvp in student_rsvps:
                rsvp.attended = False
        elif not any(r.attended for r in student_rsvps):
            min(student_rsvps, key=lambda r: r.event_id).attended = True


def make_sheet(rng: random.Random, students: list[Student], events: list[Event], rsvps: list[Rsvp]) -> list[list[str]]:
    """Flatten RSVPs into the old one-big-sheet design, then plant its typical mistakes."""
    by_netid = {s.netid: s for s in students}
    by_event = {e.event_id: e for e in events}
    rows = []
    for rsvp in sorted(rsvps, key=lambda r: (by_event[r.event_id].event_date, r.event_id, r.netid)):
        s, e = by_netid[rsvp.netid], by_event[rsvp.event_id]
        rows.append([s.netid, s.name, s.email, str(s.grad_year), e.club, e.title, e.event_date.isoformat(),
                     e.location, str(e.capacity), "yes" if rsvp.attended else "no"])

    netid_col, email_col, club_col, title_col, date_col, location_col = 0, 2, 4, 5, 6, 7
    planted_titles = set(OVERBOOKED_EXTRA) | {ZERO_RSVP_EVENT, INTRO_TO_GIT}
    featured_netid = FEATURED_STUDENT[0]

    rows_by_student: dict[str, list[list[str]]] = {}
    for row in rows:
        rows_by_student.setdefault(row[netid_col], []).append(row)
    email_candidates = sorted(n for n, rs in rows_by_student.items()
                              if len(rs) >= EMAIL_CHANGE_MIN_RSVPS and n != featured_netid)
    for netid in rng.sample(email_candidates, EMAIL_CHANGE_COUNT):
        student = by_netid[netid]
        old_email = f"{student.first}.{student.last}@{OLD_EMAIL_DOMAIN}".lower()
        student_rows = rows_by_student[netid]
        for row in student_rows[: len(student_rows) // 2]:
            row[email_col] = old_email

    rows_by_event: dict[tuple[str, str], list[list[str]]] = {}
    for row in rows:
        rows_by_event.setdefault((row[title_col], row[date_col]), []).append(row)
    move_candidates = sorted(k for k, rs in rows_by_event.items()
                             if len(rs) >= ROOM_MOVE_MIN_RSVPS and k[0] not in planted_titles)
    for key in rng.sample(move_candidates, ROOM_MOVE_COUNT):
        event_rows = rows_by_event[key]
        new_room = rng.choice([loc for loc in ALL_LOCATIONS if loc != event_rows[0][location_col]])
        for row in event_rows[len(event_rows) // 2:]:
            row[location_col] = new_room

    for club, (misspelling, count) in MISSPELLINGS.items():
        club_rows = [row for row in rows if row[club_col] == club]
        for row in rng.sample(club_rows, count):
            row[club_col] = misspelling

    for index in sorted(rng.sample(range(len(rows)), DUPLICATE_SIGNUP_COUNT), reverse=True):
        rows.insert(index + 1, list(rows[index]))
    return rows


def validate(events: list[Event], rsvps: list[Rsvp], sheet: list[list[str]]) -> dict[str, int]:
    """Check every planted fact; raise ValueError naming the first fact that does not hold."""
    counts = {e.event_id: 0 for e in events}
    for rsvp in rsvps:
        counts[rsvp.event_id] += 1
    overbooked = sorted(e.title for e in events if counts[e.event_id] > e.capacity)
    if overbooked != sorted(OVERBOOKED_EXTRA):
        raise ValueError(f"Overbooked events are {overbooked}, expected {sorted(OVERBOOKED_EXTRA)}.")
    empty = [e.title for e in events if counts[e.event_id] == 0]
    if empty != [ZERO_RSVP_EVENT]:
        raise ValueError(f"Zero-RSVP events are {empty}, expected [{ZERO_RSVP_EVENT!r}].")

    per_student: dict[str, list[bool]] = {}
    for rsvp in rsvps:
        per_student.setdefault(rsvp.netid, []).append(rsvp.attended)
    no_shows = [n for n, a in per_student.items() if len(a) >= NO_SHOW_MIN_RSVPS and not any(a)]
    if len(no_shows) != NO_SHOW_COUNT:
        raise ValueError(f"Found {len(no_shows)} no-show students, expected {NO_SHOW_COUNT}.")
    if len(per_student.get(FEATURED_STUDENT[0], [])) != FEATURED_RSVP_COUNT:
        raise ValueError(f"Featured student {FEATURED_STUDENT[0]} must have {FEATURED_RSVP_COUNT} RSVPs.")
    if len({(e.title, e.event_date) for e in events}) != len(events):
        raise ValueError("Two events share a title and date; the sheet anomaly checks need them unique.")
    if len(sheet) != len(rsvps) + DUPLICATE_SIGNUP_COUNT:
        raise ValueError(f"Sheet has {len(sheet)} rows, expected {len(rsvps) + DUPLICATE_SIGNUP_COUNT}.")

    return {
        "events": len(events),
        "rsvps": len(rsvps),
        "attended": sum(r.attended for r in rsvps),
        "sheet_rows": len(sheet),
        "no_shows": len(no_shows),
    }


def sql_literal(value: object) -> str:
    """Render a Python value as a SQL literal."""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, date):
        value = value.isoformat()
    return "'" + str(value).replace("'", "''") + "'"


def insert_statements(table: str, columns: list[str], rows: list[list[object]]) -> list[str]:
    """Multi-row INSERT statements, INSERT_BATCH_SIZE rows each."""
    statements = []
    for start in range(0, len(rows), INSERT_BATCH_SIZE):
        batch = rows[start:start + INSERT_BATCH_SIZE]
        values = ",\n".join("  (" + ", ".join(sql_literal(v) for v in row) + ")" for row in batch)
        statements.append(f"INSERT INTO {table} ({', '.join(columns)}) VALUES\n{values};")
    return statements


def render_seed(students: list[Student], events: list[Event], rsvps: list[Rsvp], sheet: list[list[str]]) -> str:
    """The full contents of seed.sql."""
    club_ids = {name: i for i, (name, _, _) in enumerate(CLUBS, start=1)}
    parts = [
        f"-- Generated by scripts/generate_seed.py (seed {SEED}). Do not edit by hand; regenerate instead.",
        "-- Run schema.sql first.",
        "BEGIN;",
        *insert_statements("clubs", ["club_id", "name"], [[i, name] for name, i in club_ids.items()]),
        *insert_statements("students", ["netid", "name", "email", "grad_year"],
                           [[s.netid, s.name, s.email, s.grad_year] for s in students]),
        *insert_statements("events", ["event_id", "club_id", "title", "event_date", "location", "capacity"],
                           [[e.event_id, club_ids[e.club], e.title, e.event_date, e.location, e.capacity]
                            for e in events]),
        *insert_statements("rsvps", ["netid", "event_id", "attended"],
                           [[r.netid, r.event_id, r.attended] for r in rsvps]),
        *insert_statements("signups_sheet", ["netid", "student_name", "student_email", "grad_year", "club_name",
                                             "event_title", "event_date", "location", "capacity", "attended"],
                           sheet),
        "COMMIT;",
    ]
    return "\n".join(parts) + "\n"


def main() -> None:
    """Generate, validate, and write the seed file."""
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUTPUT
    rng = random.Random(SEED)
    students = make_students(rng)
    events = make_events(rng)
    rsvps = make_rsvps(rng, students, events)
    sheet = make_sheet(rng, students, events, rsvps)
    summary = validate(events, rsvps, sheet)
    output.write_text(render_seed(students, events, rsvps, sheet), encoding="utf-8")
    print(f"Wrote {output}: {len(students)} students, " +
          ", ".join(f"{k}={v}" for k, v in summary.items()), file=sys.stderr)


if __name__ == "__main__":
    main()
