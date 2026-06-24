CREATE TYPE "public"."funcionario_achado_prioridade" AS ENUM('alta', 'media');--> statement-breakpoint
ALTER TABLE "funcionario_achados" ADD COLUMN "prioridade" "funcionario_achado_prioridade";