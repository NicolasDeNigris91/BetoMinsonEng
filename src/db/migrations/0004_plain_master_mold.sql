ALTER TABLE "achados" ADD COLUMN "prazo_em" date;--> statement-breakpoint
CREATE INDEX "achados_prazo_idx" ON "achados" USING btree ("prazo_em");