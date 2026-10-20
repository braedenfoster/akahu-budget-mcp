CREATE TABLE `declined_bill_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_type` text NOT NULL,
	`match_value` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`declined_at` text NOT NULL
);
