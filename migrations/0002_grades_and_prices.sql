CREATE TABLE `service_prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_id` integer NOT NULL,
	`grade` text NOT NULL,
	`price` real NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_prices_key` ON `service_prices` (`service_id`,`grade`);--> statement-breakpoint
ALTER TABLE `staff` ADD `grade` text DEFAULT 'stylist2' NOT NULL;