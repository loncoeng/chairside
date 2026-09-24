CREATE TABLE `booking_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_id` integer NOT NULL,
	`at` integer DEFAULT (unixepoch()) NOT NULL,
	`kind` text NOT NULL,
	`before` text,
	`after` text,
	`by_staff_id` integer,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`by_staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `booking_events_booking_idx` ON `booking_events` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_events_at_idx` ON `booking_events` (`at`);