CREATE TABLE `api_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`updated_at_utc` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_api_rate_limits_updated` ON `api_rate_limits` (`updated_at_utc`);--> statement-breakpoint
CREATE INDEX `idx_analyses_created` ON `analyses` (`created_at_utc`);