-- Sample rows for the public instance at chairside.loncoeng.workers.dev.
--
-- Invented. No name here belongs to a real person, and no shop is described.
-- The counts are the only thing taken from life: nine styling chairs, three
-- shampoo stations, eight on the team.
--
-- A shop running this would not apply this file. They enter their own room
-- and their own people once, on the settings screen.
--
-- INSERT OR IGNORE, with the ids written out, so that re-running it on every
-- deploy changes nothing. A seed that duplicates its own rows is worse than
-- no seed.

INSERT OR IGNORE INTO seats (id, name, kind, active, sort_order) VALUES
  (1,  'A1', 'styling', 1, 1),
  (2,  'A2', 'styling', 1, 2),
  (3,  'A3', 'styling', 1, 3),
  (4,  'A4', 'styling', 1, 4),
  (5,  'A5', 'styling', 1, 5),
  (6,  'B1', 'styling', 1, 6),
  (7,  'B2', 'styling', 1, 7),
  (8,  'B3', 'styling', 1, 8),
  (9,  'B4', 'styling', 1, 9),
  (10, 'S1', 'shampoo', 1, 10),
  (11, 'S2', 'shampoo', 1, 11),
  (12, 'S3', 'shampoo', 1, 12);

INSERT OR IGNORE INTO staff (id, name, role, color, joined_on, left_on) VALUES
  (1, 'Aoi',  'owner',     '#B4553F', '2019-04-01', NULL),
  (2, 'Ren',  'stylist',   '#4B6FA8', '2020-07-01', NULL),
  (3, 'Mei',  'stylist',   '#4E7F5E', '2021-03-15', NULL),
  (4, 'Kai',  'stylist',   '#8A6510', '2022-01-10', NULL),
  (5, 'Sora', 'stylist',   '#7A5490', '2022-09-01', NULL),
  (6, 'Yuna', 'stylist',   '#3F7F8A', '2023-05-08', NULL),
  (7, 'Riku', 'stylist',   '#A04A6B', '2024-02-19', NULL),
  (8, 'Hana', 'assistant', '#6B7A45', '2025-04-01', NULL);
