CREATE TABLE "support_message" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"author" text NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "support_ticket_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text,
	"requester_name" text NOT NULL,
	"requester_email" text NOT NULL,
	"organization_id" text,
	"workspace_name" text,
	"subject" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"requester_unread" boolean DEFAULT false NOT NULL,
	"staff_unread" boolean DEFAULT true NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_ticket_id_support_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_message_ticket_idx" ON "support_message" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "support_ticket_user_idx" ON "support_ticket" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "support_ticket_last_message_idx" ON "support_ticket" USING btree ("last_message_at");