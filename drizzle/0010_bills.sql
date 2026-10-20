CREATE TABLE `bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`cadence` text NOT NULL,
	`anchor_weekday` integer,
	`anchor_day` integer,
	`anchor_date` text,
	`amount_mode` text DEFAULT 'fixed' NOT NULL,
	`expected_amount_cents` integer NOT NULL,
	`match_type` text NOT NULL,
	`match_value` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`end_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
