CREATE TABLE `loop_phases` (
	`id` text PRIMARY KEY NOT NULL,
	`loop_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`name` text NOT NULL,
	`goal` text NOT NULL,
	`checks` text DEFAULT '[]' NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`loop_id`) REFERENCES `loops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `loops` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`status` text NOT NULL,
	`current_phase_index` integer DEFAULT 0 NOT NULL,
	`config` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_loop_phases_loop_id` ON `loop_phases` (`loop_id`);--> statement-breakpoint
CREATE INDEX `idx_loops_task_id` ON `loops` (`task_id`);