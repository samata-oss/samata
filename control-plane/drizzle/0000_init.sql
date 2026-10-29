CREATE TABLE "agent" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"phone_number" text,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_slug_unique" UNIQUE("slug"),
	CONSTRAINT "agent_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "call_log" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text,
	"room_name" text NOT NULL,
	"type" text DEFAULT 'web' NOT NULL,
	"customer_number" text,
	"status" text DEFAULT 'in-progress' NOT NULL,
	"ended_reason" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"duration_seconds" real,
	"transcript" text,
	"messages" jsonb,
	"latency" jsonb,
	"usage" jsonb,
	"summary" text,
	"structured_data" jsonb,
	"analysis_error" text,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_log" ADD CONSTRAINT "call_log_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_log_agent_idx" ON "call_log" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "call_log_started_at_idx" ON "call_log" USING btree ("started_at");