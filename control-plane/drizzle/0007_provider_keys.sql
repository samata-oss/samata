CREATE TABLE "provider_key" (
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"hint" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_key_organization_id_provider_pk" PRIMARY KEY("organization_id","provider")
);
--> statement-breakpoint
ALTER TABLE "provider_key" ADD CONSTRAINT "provider_key_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;