ALTER TABLE `audit_log` ADD `actor_member_id` integer REFERENCES members(id);--> statement-breakpoint
ALTER TABLE `audit_log` ADD `actor_source` text;