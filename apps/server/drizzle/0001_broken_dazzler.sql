CREATE TABLE "import_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"error" text,
	"current_item" integer,
	"total_items" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"retry_count" integer DEFAULT 0 NOT NULL
);
