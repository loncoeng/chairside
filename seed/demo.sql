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

INSERT OR REPLACE INTO staff (id, name, role, grade, color, joined_on, left_on) VALUES
  (1, 'Aoi',  'owner',     'owner',     '#B4553F', '2019-04-01', NULL),
  (2, 'Ren',  'stylist',   'stylist1',  '#4B6FA8', '2020-07-01', NULL),
  (3, 'Mei',  'stylist',   'stylist1',  '#4E7F5E', '2021-03-15', NULL),
  (4, 'Kai',  'stylist',   'stylist2',  '#8A6510', '2022-01-10', NULL),
  (5, 'Sora', 'stylist',   'stylist2',  '#7A5490', '2022-09-01', NULL),
  (6, 'Yuna', 'stylist',   'stylist2',  '#3F7F8A', '2023-05-08', NULL),
  (7, 'Riku', 'stylist',   'stylist2',  '#A04A6B', '2024-02-19', NULL),
  (8, 'Hana', 'assistant', 'assistant', '#6B7A45', '2025-04-01', NULL);

-- The menu. Names carry three languages because the shop types them in;
-- interface strings live in code, these are data.
--
-- Durations are what the booking screen fills in, not a rule. A colour that
-- runs long is normal and the screen lets it.
--
-- `price` is what it costs when the stylist makes no difference — a shampoo
-- is a shampoo. Where it does, service_prices has a row per grade and this
-- column is the fallback.
INSERT OR REPLACE INTO services (id, name_ja, name_zh, name_en, duration_min, seat_kind, price, active, sort_order) VALUES
  (1,  'カット',        '剪髮',     'Cut',            45, 'styling',  450, 1, 1),
  (3,  '前髪カット',    '剪瀏海',   'Fringe trim',    15, 'styling',  150, 1, 2),
  (4,  'シャンプー',    '洗髮',     'Shampoo',        20, 'shampoo',  180, 1, 3),
  (5,  'ブロー',        '吹乾',     'Blow-dry',       25, 'styling',  280, 1, 4),
  (6,  'カラー',        '染髮',     'Colour',         90, 'styling',  980, 1, 5),
  (7,  'パーマ',        '電髮',     'Perm',          120, 'styling', 1280, 1, 6),
  (8,  '縮毛矯正',      '離子燙',   'Straightening', 180, 'styling', 2200, 1, 7),
  (9,  'トリートメント','護髮',     'Treatment',      30, 'shampoo',  580, 1, 8),
  (10, 'ヘッドスパ',    '頭皮護理', 'Head spa',       40, 'shampoo',  680, 1, 9);

-- What each treatment costs with each grade.
--
-- Only the ones where the person matters. A cut is 750 with the owner and
-- 300 with a junior stylist, and that difference is most of what a guest is
-- choosing between when they book. A shampoo costs the same whoever does it,
-- so it has no rows here and falls back to services.price.
INSERT OR REPLACE INTO service_prices (id, service_id, grade, price) VALUES
  (1,  1, 'owner',    750), (2,  1, 'stylist1', 450), (3,  1, 'stylist2', 300),
  (4,  5, 'owner',    380), (5,  5, 'stylist1', 280), (6,  5, 'stylist2', 220),
  (7,  6, 'owner',   1500), (8,  6, 'stylist1', 980), (9,  6, 'stylist2', 780),
  (10, 7, 'owner',   1800), (11, 7, 'stylist1',1280), (12, 7, 'stylist2', 980),
  (13, 8, 'owner',   2800), (14, 8, 'stylist1',2200), (15, 8, 'stylist2',1800);

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
-- Numbers carry a dialling code. A salon here has local guests, regulars over
-- from Hong Kong, and visitors from the mainland — three different codes, and
-- a number without one cannot be rung.
--
-- REPLACE rather than IGNORE for this table: the public instance's sample
-- identities belong to this file, so correcting one here corrects it there.
-- A shop would never apply this file at all.
INSERT OR REPLACE INTO customers (id, name, search_key, phone, note, first_visit_on) VALUES
  (1,  '陳 嘉雯',     'chan ka man',     '+853 6612 3401', '広東語。肩につく長さを維持', '2020-11-20'),
  (2,  '李 偉強',     'lei wai keong',   '+853 6612 3402', NULL,                          '2019-03-18'),
  (3,  '黄 詩婷',     'wong sze ting',   '+853 6612 3403', NULL,                          '2024-05-22'),
  (4,  'Emily Wong',  'wong emily',      '+852 9612 3404', '英語のみ',                    '2023-08-05'),
  (5,  '張 曉彤',     'cheung hiu tung', '+853 6612 3405', '前回より明るめ希望',          '2021-10-25'),
  (6,  '林 家豪',     'lam ka ho',       '+853 6612 3406', NULL,                          '2023-12-01'),
  (7,  '何 俊傑',     'ho chun kit',     '+853 6612 3407', '毎回カットのみ',              '2022-09-30'),
  (8,  '吳 佩珊',     'ng pui shan',     '+853 6612 3408', '頭皮が弱い。薬剤は弱めで',    '2024-01-09'),
  (9,  'Sofia Lopes', 'lopes sofia',     '+853 6612 3409', 'ポルトガル語／英語',          '2025-02-14'),
  (10, 'Ana Ferreira','ferreira ana',    '+853 6612 3410', NULL,                          '2025-06-03'),
  (11, '田中 美咲',   'tanaka misaki',   '+853 6612 3411', NULL,                          '2021-06-12'),
  (12, '渡辺 さくら', 'watanabe sakura', '+86 138 6612 3412', NULL,                          '2022-02-03');

-- A few treatment records, so the customers screen has something to show.
--
-- Invented, like everything else here. The formulas are the shape a stylist
-- actually writes — a mix, a developer, a processing time — rather than prose
-- about hair, because that is what gets read before the next colour.
--
-- `caution` is deliberately not on the customer row. It belongs to a visit
-- ("her scalp reacted to this") and reads on the person's page as a standing
-- warning; putting it on the customer would lose when it was noticed.
INSERT OR REPLACE INTO records (id, customer_id, booking_id, formula, note, caution, recorded_on) VALUES
  (1, 1, NULL, '8NB : 8MT = 1:1 / OX 6% / 25min', '根元は明るめ、毛先は落ち着いた色', NULL,                          '2026-07-12'),
  (2, 1, NULL, '8NB : 8MT = 1:1 / OX 4.5% / 30min', '前回より1トーン暗く',           '頭皮が敏感。薬剤は根元から5mm空ける', '2026-08-23'),
  (3, 3, NULL, NULL,                                 'いつもどおり肩上。前髪は眉下', NULL,                          '2026-08-30'),
  (4, 5, NULL, 'ストレート剤 弱酸性 / 20min',        '既矯正部は避ける',             '過去に他店で強い薬剤。毛先が弱い', '2026-06-15'),
  (5, 9, NULL, NULL,                                 'English only. Prefers short.', NULL,                          '2026-09-06');

-- One unscheduled closure, on a day that already has bookings.
--
-- The sample had none at all, which hid a fault in the notice above the
-- calendar for weeks: the sentence was glued together out of fragments and
-- only came out right for a plain closed day. Nobody saw it because nobody
-- could get the screen to show it.
--
-- It also puts the rule on display rather than only in DESIGN.md: closing a
-- day does not cancel what is booked on it. Forty-three people are still
-- coming, and somebody has to ring them.
INSERT OR REPLACE INTO closures (id, date, reason) VALUES
  (1, '2026-09-25', '設備点検');
