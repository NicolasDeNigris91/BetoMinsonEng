CREATE TABLE "funcionario_achados" (
	"funcionario_id" uuid NOT NULL,
	"achado_id" uuid NOT NULL,
	"atribuido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funcionario_achados_funcionario_id_achado_id_pk" PRIMARY KEY("funcionario_id","achado_id")
);
--> statement-breakpoint
CREATE TABLE "funcionarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(200) NOT NULL,
	"token" varchar(128) NOT NULL,
	"desativado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funcionarios_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "achado_comentarios" ADD COLUMN "funcionario_id" uuid;--> statement-breakpoint
ALTER TABLE "achado_eventos" ADD COLUMN "funcionario_origem_id" uuid;--> statement-breakpoint
ALTER TABLE "funcionario_achados" ADD CONSTRAINT "funcionario_achados_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcionario_achados" ADD CONSTRAINT "funcionario_achados_achado_id_achados_id_fk" FOREIGN KEY ("achado_id") REFERENCES "public"."achados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "funcionario_achados_achado_idx" ON "funcionario_achados" USING btree ("achado_id");--> statement-breakpoint
CREATE INDEX "funcionarios_token_idx" ON "funcionarios" USING btree ("token");--> statement-breakpoint
ALTER TABLE "achado_comentarios" ADD CONSTRAINT "achado_comentarios_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achado_eventos" ADD CONSTRAINT "achado_eventos_funcionario_origem_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_origem_id") REFERENCES "public"."funcionarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achado_eventos_funcionario_origem_idx" ON "achado_eventos" USING btree ("funcionario_origem_id");