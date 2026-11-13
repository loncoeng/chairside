-- Money in whole cents and rates in basis points, instead of floating point.
-- 0.1 + 0.2 is not 0.3 in a REAL column, and a month of takings is a long sum.
--
-- SQLite cannot change a column's type, so payments, service_prices and
-- currencies are rebuilt (nothing references them). services is referenced by
-- booking_items, so it keeps its table and swaps one nullable column instead.
-- Every value is rounded to the nearest cent on the way across.

ALTER TABLE `services` ADD `price_cents` integer;--> statement-breakpoint
UPDATE `services` SET `price_cents` = CAST(round(`price` * 100) AS integer);--> statement-breakpoint
ALTER TABLE `services` DROP COLUMN `price`;--> statement-breakpoint

CREATE TABLE `__new_service_prices` (	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,	`service_id` integer NOT NULL,	`grade` text NOT NULL,	`price_cents` integer NOT NULL,	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade);--> statement-breakpoint
INSERT INTO `__new_service_prices` (`id`, `service_id`, `grade`, `price_cents`)
  SELECT `id`, `service_id`, `grade`, CAST(round(`price` * 100) AS integer) FROM `service_prices`;--> statement-breakpoint
DROP TABLE `service_prices`;--> statement-breakpoint
ALTER TABLE `__new_service_prices` RENAME TO `service_prices`;--> statement-breakpoint
CREATE UNIQUE INDEX `service_prices_key` ON `service_prices` (`service_id`,`grade`);--> statement-breakpoint

CREATE TABLE `__new_currencies` (	`code` text PRIMARY KEY NOT NULL,	`rate_to_base_bp` integer DEFAULT 10000 NOT NULL,	`active` integer DEFAULT true NOT NULL,	`sort_order` integer DEFAULT 0 NOT NULL);--> statement-breakpoint
INSERT INTO `__new_currencies` (`code`, `rate_to_base_bp`, `active`, `sort_order`)
  SELECT `code`, CAST(round(`rate_to_base` * 10000) AS integer), `active`, `sort_order` FROM `currencies`;--> statement-breakpoint
DROP TABLE `currencies`;--> statement-breakpoint
ALTER TABLE `__new_currencies` RENAME TO `currencies`;--> statement-breakpoint

CREATE TABLE `__new_payments` (	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,	`booking_id` integer NOT NULL,	`amount_cents` integer NOT NULL,	`currency` text NOT NULL,	`rate_to_base_bp` integer NOT NULL,	`method` text DEFAULT 'cash' NOT NULL,	`paid_at` integer DEFAULT (unixepoch()) NOT NULL,	`request_key` text,	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade);--> statement-breakpoint
INSERT INTO `__new_payments` (`id`, `booking_id`, `amount_cents`, `currency`, `rate_to_base_bp`, `method`, `paid_at`)
  SELECT `id`, `booking_id`, CAST(round(`amount` * 100) AS integer), `currency`,
         CAST(round(`rate_to_base` * 10000) AS integer), `method`, `paid_at`
    FROM `payments`;--> statement-breakpoint
DROP TABLE `payments`;--> statement-breakpoint
ALTER TABLE `__new_payments` RENAME TO `payments`;--> statement-breakpoint
CREATE INDEX `payments_booking_idx` ON `payments` (`booking_id`);--> statement-breakpoint
CREATE INDEX `payments_paid_at_idx` ON `payments` (`paid_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_request_key` ON `payments` (`request_key`);--> statement-breakpoint

-- Sign-in failures, counted across every Worker instance (src/worker/session-api.ts).
CREATE TABLE `failed_sign_ins` (	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,	`who` text NOT NULL,	`at` integer NOT NULL);--> statement-breakpoint
CREATE INDEX `failed_sign_ins_who_idx` ON `failed_sign_ins` (`who`,`at`);
