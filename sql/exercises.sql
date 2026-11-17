-- Workshop exercises with reference answers.
-- The workshop page reads this file: each exercise starts at "-- @exercise <n>", the "-- @key" lines
-- describe it, and the SQL under them is the reference answer. psql can run the whole file as-is.

-- @exercise 1
-- @level One table
-- @live
-- @check shape
-- @prompt Show every column for 10 students.
-- @hint SELECT * means "every column". LIMIT 10 stops after 10 rows.
SELECT *
FROM students
LIMIT 10;

-- @exercise 2
-- @level One table
-- @sorted 2 asc
-- @prompt Show the title and date of every event in October 2025, earliest first.
-- @hint WHERE keeps only the rows you want (dates compare like '2025-10-01'). ORDER BY sorts.
SELECT title, event_date
FROM events
WHERE event_date >= '2025-10-01' AND event_date < '2025-11-01'
ORDER BY event_date;

-- @exercise 3
-- @level One table
-- @prompt How many students graduate in 2028?
-- @hint COUNT(*) counts the rows that are left after WHERE.
SELECT COUNT(*)
FROM students
WHERE grad_year = 2028;

-- @exercise 4
-- @level One table
-- @prompt Show the title, date, and capacity of every event that holds more than 100 people.
-- @hint Which column stores how many people fit? Compare it with > 100.
SELECT title, event_date, capacity
FROM events
WHERE capacity > 100;

-- @exercise 5
-- @level Joins
-- @live
-- @prompt Show each event's title next to the name of the club that hosts it.
-- @hint events.club_id points at clubs.club_id. FROM events JOIN clubs ON (the two ids are equal).
SELECT events.title, clubs.name
FROM events
JOIN clubs ON clubs.club_id = events.club_id;

-- @exercise 6
-- @level Joins
-- @prompt Show the title and date of every event that student sk101 RSVP'd to.
-- @hint Start FROM rsvps (it knows the NetID), then JOIN events to get titles and dates.
SELECT events.title, events.event_date
FROM rsvps
JOIN events ON events.event_id = rsvps.event_id
WHERE rsvps.netid = 'sk101';

-- @exercise 7
-- @level Joins
-- @prompt Show the names of the students who actually attended Intro to Git.
-- @hint You need three tables: students, rsvps, and events. attended is true or false.
SELECT students.name
FROM students
JOIN rsvps ON rsvps.netid = students.netid
JOIN events ON events.event_id = rsvps.event_id
WHERE events.title = 'Intro to Git' AND rsvps.attended;

-- @exercise 8
-- @level Grouping
-- @live
-- @prompt How many events did each club host? Show the club name and the count.
-- @hint GROUP BY clubs.name makes one row per club; COUNT(*) counts the events in each group.
SELECT clubs.name, COUNT(*) AS events_hosted
FROM clubs
JOIN events ON events.club_id = clubs.club_id
GROUP BY clubs.name;

-- @exercise 9
-- @level Grouping
-- @sorted 3 desc
-- @prompt How many RSVPs did each event get? Show the title, date, and RSVP count, most popular first.
-- @hint Titles repeat (there are 12 Weekly Chess Nights), so group by events.event_id, not just the title.
SELECT events.title, events.event_date, COUNT(*) AS rsvp_count
FROM events
JOIN rsvps ON rsvps.event_id = events.event_id
GROUP BY events.event_id, events.title, events.event_date
ORDER BY rsvp_count DESC;

-- @exercise 10
-- @level Grouping
-- @prompt Which events are overbooked (more RSVPs than capacity)? Show the title, capacity, and RSVP count.
-- @hint Start from exercise 9. WHERE filters rows before grouping; HAVING filters groups after.
SELECT events.title, events.capacity, COUNT(*) AS rsvp_count
FROM events
JOIN rsvps ON rsvps.event_id = events.event_id
GROUP BY events.event_id, events.title, events.capacity
HAVING COUNT(*) > events.capacity;

-- @exercise 11
-- @level Grouping
-- @sorted 2 desc
-- @prompt Which club has the best turnout? For each club, show its name and the fraction of RSVPs that actually came (between 0 and 1), best first.
-- @hint rsvps.attended::int turns true/false into 1/0, so AVG of it is the fraction who came. ROUND(x, 2) tidies it.
SELECT clubs.name, ROUND(AVG(rsvps.attended::int), 2) AS turnout
FROM clubs
JOIN events ON events.club_id = clubs.club_id
JOIN rsvps ON rsvps.event_id = events.event_id
GROUP BY clubs.name
ORDER BY turnout DESC;

-- @exercise 12
-- @level Stretch
-- @prompt Exercise 9 listed 119 events, but there are 120. Which event got zero RSVPs? Show its title.
-- @hint A LEFT JOIN keeps every event even when no RSVP matches; the RSVP columns are then NULL.
SELECT events.title
FROM events
LEFT JOIN rsvps ON rsvps.event_id = events.event_id
WHERE rsvps.event_id IS NULL;

-- @exercise 13
-- @level Stretch
-- @prompt Which students RSVP'd at least 3 times but never attended anything? Show their NetID and name.
-- @hint Group RSVPs by student. HAVING can test two things at once: COUNT(*) >= 3 AND SUM(rsvps.attended::int) = 0.
SELECT students.netid, students.name
FROM students
JOIN rsvps ON rsvps.netid = students.netid
GROUP BY students.netid, students.name
HAVING COUNT(*) >= 3 AND SUM(rsvps.attended::int) = 0;

-- @exercise 14
-- @level Stretch
-- @prompt Back to the old sheet: which NetIDs appear with more than one email in signups_sheet? Show the NetID and how many different emails.
-- @hint COUNT(DISTINCT student_email) counts different values. Could this ever happen in the students table?
SELECT netid, COUNT(DISTINCT student_email) AS emails
FROM signups_sheet
GROUP BY netid
HAVING COUNT(DISTINCT student_email) > 1;
