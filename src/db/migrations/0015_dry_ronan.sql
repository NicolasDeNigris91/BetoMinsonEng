ALTER TABLE "mensagens" ADD COLUMN "achado_id" uuid;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_achado_id_achados_id_fk" FOREIGN KEY ("achado_id") REFERENCES "public"."achados"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mensagens_achado_idx" ON "mensagens" USING btree ("achado_id");