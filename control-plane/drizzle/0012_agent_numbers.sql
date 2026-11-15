CREATE TABLE "agent_number" (
	"number" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent" DROP CONSTRAINT "agent_phone_number_unique";--> statement-breakpoint
ALTER TABLE "agent_number" ADD CONSTRAINT "agent_number_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_number" ADD CONSTRAINT "agent_number_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_number_agent_idx" ON "agent_number" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_number_organization_idx" ON "agent_number" USING btree ("organization_id");--> statement-breakpoint
INSERT INTO "agent_number" ("number", "agent_id", "organization_id")
SELECT "phone_number", "id", "organization_id" FROM "agent" WHERE "phone_number" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "agent" DROP COLUMN "phone_number";