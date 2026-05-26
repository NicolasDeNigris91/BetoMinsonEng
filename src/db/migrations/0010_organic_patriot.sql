CREATE TYPE "public"."comentario_autor" AS ENUM('profissional', 'engenharia');--> statement-breakpoint
CREATE TABLE "achado_comentarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"achado_id" uuid NOT NULL,
	"escopo_id" uuid NOT NULL,
	"autor" "comentario_autor" NOT NULL,
	"texto" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "achado_comentarios" ADD CONSTRAINT "achado_comentarios_achado_id_achados_id_fk" FOREIGN KEY ("achado_id") REFERENCES "public"."achados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achado_comentarios" ADD CONSTRAINT "achado_comentarios_escopo_id_escopos_id_fk" FOREIGN KEY ("escopo_id") REFERENCES "public"."escopos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achado_comentarios_achado_escopo_idx" ON "achado_comentarios" USING btree ("achado_id","escopo_id","created_at");