CREATE TYPE "public"."achado_status" AS ENUM('aberto', 'resolvido');--> statement-breakpoint
CREATE TYPE "public"."categoria" AS ENUM('ELE', 'HID', 'HVAC', 'PISCINA', 'ASP', 'SIS');--> statement-breakpoint
CREATE TYPE "public"."evento_tipo" AS ENUM('criado', 'persiste', 'resolvido', 'nota');--> statement-breakpoint
CREATE TYPE "public"."vistoria_status" AS ENUM('rascunho', 'finalizada');--> statement-breakpoint
CREATE TABLE "achado_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"achado_id" uuid NOT NULL,
	"vistoria_id" uuid NOT NULL,
	"tipo" "evento_tipo" NOT NULL,
	"nota_extra" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "achados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unidade_id" uuid NOT NULL,
	"categoria" "categoria" NOT NULL,
	"local" varchar(300),
	"descricao" text NOT NULL,
	"status" "achado_status" DEFAULT 'aberto' NOT NULL,
	"vistoria_origem_id" uuid NOT NULL,
	"vistoria_resolvido_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empreendimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(200) NOT NULL,
	"cliente" varchar(200),
	"endereco" text,
	"logo_url" text,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fotos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"achado_evento_id" uuid NOT NULL,
	"arquivo_path" text NOT NULL,
	"thumb_path" text NOT NULL,
	"legenda" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vistoria_id" uuid NOT NULL,
	"token" varchar(64) NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "unidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empreendimento_id" uuid NOT NULL,
	"nome" varchar(100) NOT NULL,
	"observacoes" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vistorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unidade_id" uuid NOT NULL,
	"data" date NOT NULL,
	"vistoriador_nome" varchar(200),
	"status" "vistoria_status" DEFAULT 'rascunho' NOT NULL,
	"observacoes_gerais" text,
	"finalizada_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "achado_eventos" ADD CONSTRAINT "achado_eventos_achado_id_achados_id_fk" FOREIGN KEY ("achado_id") REFERENCES "public"."achados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achado_eventos" ADD CONSTRAINT "achado_eventos_vistoria_id_vistorias_id_fk" FOREIGN KEY ("vistoria_id") REFERENCES "public"."vistorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achados" ADD CONSTRAINT "achados_unidade_id_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achados" ADD CONSTRAINT "achados_vistoria_origem_id_vistorias_id_fk" FOREIGN KEY ("vistoria_origem_id") REFERENCES "public"."vistorias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achados" ADD CONSTRAINT "achados_vistoria_resolvido_id_vistorias_id_fk" FOREIGN KEY ("vistoria_resolvido_id") REFERENCES "public"."vistorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fotos" ADD CONSTRAINT "fotos_achado_evento_id_achado_eventos_id_fk" FOREIGN KEY ("achado_evento_id") REFERENCES "public"."achado_eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD CONSTRAINT "share_tokens_vistoria_id_vistorias_id_fk" FOREIGN KEY ("vistoria_id") REFERENCES "public"."vistorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidades" ADD CONSTRAINT "unidades_empreendimento_id_empreendimentos_id_fk" FOREIGN KEY ("empreendimento_id") REFERENCES "public"."empreendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vistorias" ADD CONSTRAINT "vistorias_unidade_id_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achado_eventos_achado_idx" ON "achado_eventos" USING btree ("achado_id");--> statement-breakpoint
CREATE INDEX "achado_eventos_vistoria_idx" ON "achado_eventos" USING btree ("vistoria_id");--> statement-breakpoint
CREATE INDEX "achados_unidade_idx" ON "achados" USING btree ("unidade_id");--> statement-breakpoint
CREATE INDEX "achados_unidade_status_idx" ON "achados" USING btree ("unidade_id","status");--> statement-breakpoint
CREATE INDEX "achados_vistoria_origem_idx" ON "achados" USING btree ("vistoria_origem_id");--> statement-breakpoint
CREATE INDEX "fotos_evento_idx" ON "fotos" USING btree ("achado_evento_id");--> statement-breakpoint
CREATE INDEX "share_tokens_vistoria_idx" ON "share_tokens" USING btree ("vistoria_id");--> statement-breakpoint
CREATE INDEX "unidades_empreendimento_idx" ON "unidades" USING btree ("empreendimento_id");--> statement-breakpoint
CREATE INDEX "vistorias_unidade_idx" ON "vistorias" USING btree ("unidade_id");--> statement-breakpoint
CREATE INDEX "vistorias_data_idx" ON "vistorias" USING btree ("data");