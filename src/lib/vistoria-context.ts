import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { achadoEventos, unidades, vistorias } from "@/db/schema";

export type VistoriaCtx = {
  vistoriaId: string;
  vistoriaStatus: "rascunho" | "finalizada";
  unidadeId: string;
  empreendimentoId: string;
};

function pathOf(ctx: Pick<VistoriaCtx, "vistoriaId" | "unidadeId" | "empreendimentoId">): string {
  return `/empreendimentos/${ctx.empreendimentoId}/unidades/${ctx.unidadeId}/vistorias/${ctx.vistoriaId}`;
}

export async function vistoriaContext(vistoriaId: string): Promise<VistoriaCtx> {
  const [row] = await db
    .select({
      vistoriaId: vistorias.id,
      vistoriaStatus: vistorias.status,
      unidadeId: vistorias.unidadeId,
      empreendimentoId: unidades.empreendimentoId,
    })
    .from(vistorias)
    .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
    .where(eq(vistorias.id, vistoriaId))
    .limit(1);

  if (!row) throw new Error("Vistoria não encontrada.");
  return row;
}

export async function vistoriaContextFromEvento(
  eventoId: string,
): Promise<VistoriaCtx> {
  const [row] = await db
    .select({
      vistoriaId: achadoEventos.vistoriaId,
      vistoriaStatus: vistorias.status,
      unidadeId: vistorias.unidadeId,
      empreendimentoId: unidades.empreendimentoId,
    })
    .from(achadoEventos)
    .innerJoin(vistorias, eq(vistorias.id, achadoEventos.vistoriaId))
    .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
    .where(eq(achadoEventos.id, eventoId))
    .limit(1);

  if (!row) throw new Error("Evento não encontrado.");
  return row;
}

export function vistoriaPath(ctx: VistoriaCtx): string {
  return pathOf(ctx);
}
