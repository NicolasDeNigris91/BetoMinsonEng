ALTER TABLE "achado_comentarios" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "escopo_achados" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "escopo_share_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "escopos" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "achado_comentarios" CASCADE;--> statement-breakpoint
DROP TABLE "escopo_achados" CASCADE;--> statement-breakpoint
DROP TABLE "escopo_share_tokens" CASCADE;--> statement-breakpoint
DROP TABLE "escopos" CASCADE;--> statement-breakpoint
ALTER TABLE "achado_eventos" DROP CONSTRAINT IF EXISTS "achado_eventos_escopo_origem_id_escopos_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "achado_eventos_escopo_origem_idx";--> statement-breakpoint
ALTER TABLE "achado_eventos" DROP COLUMN IF EXISTS "escopo_origem_id";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."comentario_autor";