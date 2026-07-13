CREATE TABLE `device_workflow_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`workflow_ids` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_checks_unique` ON `device_workflow_checks` (`device_id`);--> statement-breakpoint
CREATE TABLE `workflow_run_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`workflow_id` text NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_config_device_wf_unique` ON `workflow_run_configs` (`device_id`,`workflow_id`);--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`device_id` text,
	`nodes_json` text DEFAULT '[]' NOT NULL,
	`edges_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
