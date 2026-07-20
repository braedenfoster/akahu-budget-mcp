CREATE TABLE `accounts` (
	`akahu_id` text PRIMARY KEY NOT NULL,
	`connection_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`formatted_account` text,
	`balance_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`raw` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `balance_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`balance_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`captured_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`akahu_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `balance_snapshots_account_id_date_unique` ON `balance_snapshots` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`akahu_index` integer NOT NULL,
	`label` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connections_akahu_index_unique` ON `connections` (`akahu_index`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_household_id_name_unique` ON `members` (`household_id`,`name`);