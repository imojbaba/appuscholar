CREATE TABLE "project_blobs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"key_version" integer DEFAULT 0 NOT NULL,
	"deks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_blobs" ADD CONSTRAINT "project_blobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_blobs_project_kind_idx" ON "project_blobs" USING btree ("project_id","kind");--> statement-breakpoint
CREATE INDEX "project_blobs_project_idx" ON "project_blobs" USING btree ("project_id");