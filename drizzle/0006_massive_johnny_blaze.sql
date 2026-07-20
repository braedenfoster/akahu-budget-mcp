CREATE TABLE `income_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_type` text NOT NULL,
	`match_value` text NOT NULL,
	`income_stream_id` integer NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`income_stream_id`) REFERENCES `income_streams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `income_rules_match_type_match_value_unique` ON `income_rules` (`match_type`,`match_value`);--> statement-breakpoint
CREATE TABLE `income_streams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `income_streams_name_unique` ON `income_streams` (`name`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `income_stream_id` integer REFERENCES income_streams(id);--> statement-breakpoint
ALTER TABLE `transactions` ADD `income_override` integer DEFAULT false NOT NULL;--> statement-breakpoint
--> One-time rollout (ADR-0009): seed the system Unclassified income Stream and
--> route every credit the old heuristic counted (positive, non-TRANSFER) into
--> it, so actual-income totals stay whole. is_income already matches this set,
--> so it now equals `income_stream_id IS NOT NULL`. Later syncs re-derive.
INSERT INTO `income_streams` (`name`, `is_system`, `created_at`)
SELECT 'Unclassified income', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM `income_streams` WHERE `name` = 'Unclassified income');--> statement-breakpoint
UPDATE `transactions`
SET `income_stream_id` = (SELECT `id` FROM `income_streams` WHERE `name` = 'Unclassified income')
WHERE `amount_cents` > 0 AND (`type` IS NULL OR `type` != 'TRANSFER');