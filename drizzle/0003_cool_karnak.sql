CREATE TABLE `budget_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budget_categories_name_unique` ON `budget_categories` (`name`);--> statement-breakpoint
CREATE TABLE `mapping_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_type` text NOT NULL,
	`match_value` text NOT NULL,
	`budget_category_id` integer NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`budget_category_id`) REFERENCES `budget_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mapping_rules_match_type_match_value_unique` ON `mapping_rules` (`match_type`,`match_value`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `budget_category_id` integer REFERENCES budget_categories(id);--> statement-breakpoint
ALTER TABLE `transactions` ADD `category_override` integer DEFAULT false NOT NULL;