CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ldconsole_path` text NOT NULL,
	`instance_index` integer NOT NULL,
	`status` text DEFAULT 'stopped' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_ldconsole_idx` ON `devices` (`ldconsole_path`,`instance_index`);