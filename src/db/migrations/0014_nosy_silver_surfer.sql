CREATE TYPE "public"."mensagem_autor" AS ENUM('funcionario', 'engenharia');--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funcionario_id" uuid NOT NULL,
	"autor" "mensagem_autor" NOT NULL,
	"texto" text NOT NULL,
	"lido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mensagens_funcionario_idx" ON "mensagens" USING btree ("funcionario_id","criado_em");--> statement-breakpoint
CREATE INDEX "mensagens_funcionario_lido_idx" ON "mensagens" USING btree ("funcionario_id","lido_em");