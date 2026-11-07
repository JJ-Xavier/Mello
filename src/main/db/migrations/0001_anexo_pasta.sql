PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`file_id` text,
	`folder_path` text,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `file`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "attachment_target_check" CHECK((file_id IS NULL) <> (folder_path IS NULL))
);
--> statement-breakpoint
-- Editado à mão: a tabela antiga não tem folder_path (o drizzle-kit o copiava dela, e o SQLite
-- leria "folder_path" como texto). Os anexos que já existem são todos arquivos.
INSERT INTO `__new_attachment`("id", "card_id", "file_id", "folder_path", "name", "created_at") SELECT "id", "card_id", "file_id", NULL, "name", "created_at" FROM `attachment`;--> statement-breakpoint
DROP TABLE `attachment`;--> statement-breakpoint
ALTER TABLE `__new_attachment` RENAME TO `attachment`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `attachment_card_idx` ON `attachment` (`card_id`);--> statement-breakpoint
CREATE INDEX `attachment_file_idx` ON `attachment` (`file_id`);