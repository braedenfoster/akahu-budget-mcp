CREATE TABLE `sync_state` (
	`connection_id` integer PRIMARY KEY NOT NULL,
	`cursor` text,
	`last_synced_at` text,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`akahu_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`description` text NOT NULL,
	`merchant` text,
	`akahu_category_id` text,
	`akahu_category_group` text,
	`type` text,
	`pending` integer DEFAULT false NOT NULL,
	`is_income` integer DEFAULT false NOT NULL,
	`raw` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`akahu_id`) ON UPDATE no action ON DELETE no action
);
