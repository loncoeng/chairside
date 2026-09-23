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

-- The menu. Names carry three languages because the shop types them in;
-- interface strings live in code, these are data.
--
-- Durations are what the booking screen fills in, not a rule. A colour that
-- runs long is normal and the screen lets it.
INSERT OR IGNORE INTO services (id, name_ja, name_zh, name_en, duration_min, seat_kind, price, active, sort_order) VALUES
  (1,  'カット',       '剪髮',     'Cut',                45, 'styling',  280, 1, 1),
  (2,  'メンズカット', '男士剪髮', 'Men''s cut',         30, 'styling',  220, 1, 2),
  (3,  '前髪カット',   '剪瀏海',   'Fringe trim',        15, 'styling',   80, 1, 3),
  (4,  'シャンプー',   '洗髮',     'Shampoo',            20, 'shampoo',  120, 1, 4),
  (5,  'ブロー',       '吹乾',     'Blow-dry',           25, 'styling',  180, 1, 5),
  (6,  'カラー',       '染髮',     'Colour',             90, 'styling',  680, 1, 6),
  (7,  'パーマ',       '電髮',     'Perm',              120, 'styling',  880, 1, 7),
  (8,  '縮毛矯正',     '離子燙',   'Straightening',     180, 'styling', 1580, 1, 8),
  (9,  'トリートメント','護髮',    'Treatment',          30, 'shampoo',  380, 1, 9),
  (10, 'ヘッドスパ',   '頭皮護理', 'Head spa',           40, 'shampoo',  480, 1, 10);

-- Opening hours, one row per weekday. 0 = Sunday.
-- Closed on Mondays, which is ordinary for a salon here.
INSERT OR IGNORE INTO business_hours (id, weekday, opens_at, closes_at, closed) VALUES
  (1, 0, '10:00', '19:00', 0),
  (2, 1, NULL,    NULL,    1),
  (3, 2, '10:00', '20:00', 0),
  (4, 3, '10:00', '20:00', 0),
  (5, 4, '10:00', '20:00', 0),
  (6, 5, '10:00', '20:00', 0),
  (7, 6, '10:00', '20:00', 0);

-- What the shop takes, at the rate the shop sets. 1:1:1 is what most shops in
-- Macau work at; nothing is fetched, so this keeps working offline.
INSERT OR IGNORE INTO currencies (code, rate_to_base, active, sort_order) VALUES
  ('MOP', 1.00, 1, 1),
  ('HKD', 1.00, 1, 2),
  ('CNY', 1.00, 1, 3);

-- Invented customers.
--
-- Mostly local, which is what a salon in Macau looks like even when the
-- stylist is Japanese. Three Japanese guests out of twelve, the rest Chinese
-- with a couple of Portuguese-speaking regulars. An earlier draft had five
-- Japanese names and read like a salon in Tokyo.
--
-- The mix of scripts is the point: names arrive in kanji, kana, Chinese and
-- Latin, and search has to cope with all of them. search_key holds a second
-- spelling to find them by.
--
-- REPLACE rather than IGNORE for this table: the public instance's sample
-- identities belong to this file, so correcting one here corrects it there.
-- A shop would never apply this file at all.
INSERT OR REPLACE INTO customers (id, name, search_key, phone, note, first_visit_on) VALUES
  (1,  '陳 嘉雯',     'chan ka man',     '6612 3401', '広東語。肩につく長さを維持', '2020-11-20'),
  (2,  '李 偉強',     'lei wai keong',   '6612 3402', NULL,                          '2019-03-18'),
  (3,  '黄 詩婷',     'wong sze ting',   '6612 3403', NULL,                          '2024-05-22'),
  (4,  'Emily Wong',  'wong emily',      '6612 3404', '英語のみ',                    '2023-08-05'),
  (5,  '張 曉彤',     'cheung hiu tung', '6612 3405', '前回より明るめ希望',          '2021-10-25'),
  (6,  '林 家豪',     'lam ka ho',       '6612 3406', NULL,                          '2023-12-01'),
  (7,  '何 俊傑',     'ho chun kit',     '6612 3407', '毎回カットのみ',              '2022-09-30'),
  (8,  '吳 佩珊',     'ng pui shan',     '6612 3408', '頭皮が弱い。薬剤は弱めで',    '2024-01-09'),
  (9,  'Sofia Lopes', 'lopes sofia',     '6612 3409', 'ポルトガル語／英語',          '2025-02-14'),
  (10, 'Ana Ferreira','ferreira ana',    '6612 3410', NULL,                          '2025-06-03'),
  (11, '田中 美咲',   'tanaka misaki',   '6612 3411', NULL,                          '2021-06-12'),
  (12, '渡辺 さくら', 'watanabe sakura', '6612 3412', NULL,                          '2022-02-03');
