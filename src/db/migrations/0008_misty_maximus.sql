CREATE TABLE "escopo_share_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escopo_id" uuid NOT NULL,
	"token" varchar(64) NOT NULL,
	"revogado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escopo_share_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "vistorias" ADD COLUMN "escopo_origem_id" uuid;--> statement-breakpoint
ALTER TABLE "escopo_share_tokens" ADD CONSTRAINT "escopo_share_tokens_escopo_id_escopos_id_fk" FOREIGN KEY ("escopo_id") REFERENCES "public"."escopos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "escopo_share_tokens_escopo_idx" ON "escopo_share_tokens" USING btree ("escopo_id");--> statement-breakpoint
ALTER TABLE "vistorias" ADD CONSTRAINT "vistorias_escopo_origem_id_escopos_id_fk" FOREIGN KEY ("escopo_origem_id") REFERENCES "public"."escopos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vistorias_escopo_origem_idx" ON "vistorias" USING btree ("escopo_origem_id");