ALTER TABLE `staff` ADD `login_id` text;--> statement-breakpoint
ALTER TABLE `staff` ADD `password_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `staff_login_key` ON `staff` (`login_id`);