ALTER TABLE "projects" ALTER COLUMN "field" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "field" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "type" text;--> statement-breakpoint
-- Every existing value is the old default: nothing ever set a study's field, so none was chosen. Null makes those studies use the account's field.
UPDATE "projects" SET "field" = NULL;
