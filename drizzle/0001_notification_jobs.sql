CREATE TABLE `notification_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`fast_id` integer,
	`kind` text NOT NULL,
	`send_at` integer NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fast_id`) REFERENCES `fasts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_jobs_due_idx` ON `notification_jobs` (`status`,`send_at`);--> statement-breakpoint
CREATE INDEX `notification_jobs_fast_idx` ON `notification_jobs` (`fast_id`);--> statement-breakpoint
CREATE INDEX `notification_jobs_user_kind_idx` ON `notification_jobs` (`user_id`,`kind`,`status`);