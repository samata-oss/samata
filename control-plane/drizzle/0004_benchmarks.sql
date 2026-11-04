CREATE TABLE "bench_call" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"target" text NOT NULL,
	"call_idx" integer NOT NULL,
	"warmup" boolean DEFAULT false NOT NULL,
	"answer_ms" real,
	"greeting_onset_ms" real,
	"turns_recorded" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bench_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"config" jsonb NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bench_runner" (
	"id" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bench_turn" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"target" text NOT NULL,
	"call_idx" integer NOT NULL,
	"warmup" boolean DEFAULT false NOT NULL,
	"turn_idx" integer NOT NULL,
	"utterance" text NOT NULL,
	"latency_ms" real,
	"valid" boolean NOT NULL,
	"invalid_reason" text,
	"response_ms" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bench_call" ADD CONSTRAINT "bench_call_run_id_bench_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."bench_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bench_run" ADD CONSTRAINT "bench_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bench_turn" ADD CONSTRAINT "bench_turn_run_id_bench_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."bench_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bench_call_run_idx" ON "bench_call" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "bench_run_organization_created_idx" ON "bench_run" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "bench_run_status_idx" ON "bench_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bench_turn_run_idx" ON "bench_turn" USING btree ("run_id");