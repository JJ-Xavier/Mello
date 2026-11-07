CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `card`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_card_created_idx` ON `activity` (`card_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`file_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `file`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `attachment_card_idx` ON `attachment` (`card_id`);--> statement-breakpoint
CREATE INDEX `attachment_file_idx` ON `attachment` (`file_id`);--> statement-breakpoint
CREATE TABLE `board` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`position` text NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`is_template` integer DEFAULT false NOT NULL,
	`closed_at` integer,
	`bg_kind` text DEFAULT 'gradient' NOT NULL,
	`bg_value` text DEFAULT 'mello' NOT NULL,
	`bg_auto` integer DEFAULT true NOT NULL,
	`bg_focus` integer DEFAULT 4 NOT NULL,
	`bg_zoom` integer DEFAULT 100 NOT NULL,
	`bg_dim` integer DEFAULT 0 NOT NULL,
	`bg_blur` integer DEFAULT 0 NOT NULL,
	`bg_tone` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `card` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`title` text NOT NULL,
	`position` text NOT NULL,
	`description_html` text DEFAULT '' NOT NULL,
	`description_text` text DEFAULT '' NOT NULL,
	`note_html` text DEFAULT '' NOT NULL,
	`note_text` text DEFAULT '' NOT NULL,
	`is_done` integer DEFAULT false NOT NULL,
	`done_at` integer,
	`priority` integer,
	`due_at` text,
	`reminder` text DEFAULT 'none' NOT NULL,
	`reminder_fired_at` integer,
	`cover_kind` text,
	`cover_value` text,
	`is_template` integer DEFAULT false NOT NULL,
	`recurrence_id` text,
	`occurrence_date` text,
	`last_activity_at` integer NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `list`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recurrence_id`) REFERENCES `recurrence`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "card_priority_check" CHECK("card"."priority" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `card_list_position_idx` ON `card` (`list_id`,`position`);--> statement-breakpoint
CREATE INDEX `card_due_at_idx` ON `card` (`due_at`);--> statement-breakpoint
CREATE INDEX `card_recurrence_idx` ON `card` (`recurrence_id`);--> statement-breakpoint
CREATE INDEX `card_is_template_idx` ON `card` (`is_template`);--> statement-breakpoint
CREATE TABLE `card_label` (
	`card_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`card_id`, `label_id`),
	FOREIGN KEY (`card_id`) REFERENCES `card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `label`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `card_label_label_idx` ON `card_label` (`label_id`);--> statement-breakpoint
CREATE TABLE `checklist` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`title` text NOT NULL,
	`position` text NOT NULL,
	`hide_checked` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `card`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_card_position_idx` ON `checklist` (`card_id`,`position`);--> statement-breakpoint
CREATE TABLE `checklist_item` (
	`id` text PRIMARY KEY NOT NULL,
	`checklist_id` text NOT NULL,
	`text` text NOT NULL,
	`is_done` integer DEFAULT false NOT NULL,
	`due_date` text,
	`show_in_calendar` integer DEFAULT true NOT NULL,
	`position` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`checklist_id`) REFERENCES `checklist`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_item_checklist_position_idx` ON `checklist_item` (`checklist_id`,`position`);--> statement-breakpoint
CREATE INDEX `checklist_item_due_date_idx` ON `checklist_item` (`due_date`);--> statement-breakpoint
CREATE TABLE `file` (
	`id` text PRIMARY KEY NOT NULL,
	`ext` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`avg_color` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `label` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`name` text,
	`color` text NOT NULL,
	`position` text NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `label_board_idx` ON `label` (`board_id`);--> statement-breakpoint
CREATE TABLE `list` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`title` text NOT NULL,
	`position` text NOT NULL,
	`freezes_aging` integer DEFAULT false NOT NULL,
	`is_done_list` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `list_board_position_idx` ON `list` (`board_id`,`position`);--> statement-breakpoint
CREATE TABLE `recurrence` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`freq` text NOT NULL,
	`weekdays` integer DEFAULT 0 NOT NULL,
	`month_day` integer,
	`interval_days` integer,
	`anchor_date` text NOT NULL,
	`time` text NOT NULL,
	`target_list_id` text,
	`copy_labels_priority` integer NOT NULL,
	`copy_description` integer NOT NULL,
	`copy_checklist` integer NOT NULL,
	`copy_due_date` integer NOT NULL,
	`if_previous_open` text DEFAULT 'skip' NOT NULL,
	`ends_kind` text DEFAULT 'never' NOT NULL,
	`ends_on` text,
	`ends_after` integer,
	`due_count` integer DEFAULT 0 NOT NULL,
	`last_processed` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_list_id`) REFERENCES `list`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recurrence_board_idx` ON `recurrence` (`board_id`);--> statement-breakpoint
CREATE INDEX `recurrence_target_list_idx` ON `recurrence` (`target_list_id`);--> statement-breakpoint
CREATE TABLE `recurrence_occurrence` (
	`id` text PRIMARY KEY NOT NULL,
	`recurrence_id` text NOT NULL,
	`occurrence_date` text NOT NULL,
	`status` text NOT NULL,
	`card_id` text,
	`notice_card_id` text,
	`dismissed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`recurrence_id`) REFERENCES `recurrence`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `card`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`notice_card_id`) REFERENCES `card`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recurrence_occurrence_unique_idx` ON `recurrence_occurrence` (`recurrence_id`,`occurrence_date`);--> statement-breakpoint
CREATE INDEX `recurrence_occurrence_card_idx` ON `recurrence_occurrence` (`card_id`);--> statement-breakpoint
CREATE INDEX `recurrence_occurrence_notice_card_idx` ON `recurrence_occurrence` (`notice_card_id`);--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
