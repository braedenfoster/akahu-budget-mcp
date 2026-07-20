CREATE TABLE `planned_purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`target_category_id` integer,
	`target_period` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`target_category_id`) REFERENCES `budget_categories`(`id`) ON UPDATE no action ON DELETE no action
);
