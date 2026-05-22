CREATE TABLE "escopo_achados" (
	"escopo_id" uuid NOT NULL,
	"achado_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"adicionado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escopo_achados_escopo_id_achado_id_pk" PRIMARY KEY("escopo_id","achado_id")
);
--> statement-breakpoint
CREATE TABLE "escopos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empreendimento_id" uuid NOT NULL,
	"nome" varchar(200) NOT NULL,
	"descricao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "escopo_achados" ADD CONSTRAINT "escopo_achados_escopo_id_escopos_id_fk" FOREIGN KEY ("escopo_id") REFERENCES "public"."escopos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escopo_achados" ADD CONSTRAINT "escopo_achados_achado_id_achados_id_fk" FOREIGN KEY ("achado_id") REFERENCES "public"."achados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escopos" ADD CONSTRAINT "escopos_empreendimento_id_empreendimentos_id_fk" FOREIGN KEY ("empreendimento_id") REFERENCES "public"."empreendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "escopo_achados_achado_idx" ON "escopo_achados" USING btree ("achado_id");--> statement-breakpoint
CREATE INDEX "escopos_empreendimento_idx" ON "escopos" USING btree ("empreendimento_id");