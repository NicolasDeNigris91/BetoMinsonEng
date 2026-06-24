ALTER TABLE "vistorias" DROP CONSTRAINT IF EXISTS "vistorias_escopo_origem_id_escopos_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "vistorias_escopo_origem_idx";--> statement-breakpoint
ALTER TABLE "achado_eventos" ADD COLUMN "escopo_origem_id" uuid;--> statement-breakpoint
ALTER TABLE "achado_eventos" ADD CONSTRAINT "achado_eventos_escopo_origem_id_escopos_id_fk" FOREIGN KEY ("escopo_origem_id") REFERENCES "public"."escopos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achado_eventos_escopo_origem_idx" ON "achado_eventos" USING btree ("escopo_origem_id");--> statement-breakpoint
ALTER TABLE "vistorias" DROP COLUMN IF EXISTS "escopo_origem_id";