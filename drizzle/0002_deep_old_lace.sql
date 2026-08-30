ALTER TABLE `analyses` ADD `load_state_support` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `analyses` ADD `load_state_training_hours` integer DEFAULT 0 NOT NULL;