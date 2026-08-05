CREATE TABLE `run_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`thread_id` text,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`ts` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`run_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`total_threads` integer DEFAULT 0,
	`failed_threads` integer DEFAULT 0,
	`settings_snapshot` text,
	`started_at` integer DEFAULT 0 NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
