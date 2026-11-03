CREATE TABLE "phone_number" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"number" text NOT NULL,
	"provider_number_id" text,
	"encrypted_api_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "phone_number_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "phone_number" ADD CONSTRAINT "phone_number_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "phone_number_organization_idx" ON "phone_number" USING btree ("organization_id");