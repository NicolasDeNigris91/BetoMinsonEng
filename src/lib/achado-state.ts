import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { achadoEventos, achados, fotos } from "@/db/schema";

// Tipo da transaction inferido a partir da assinatura de db.transaction.
// Evita depender de imports internos do drizzle (PgTransaction<...>).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AchadoState = "none" | "persiste" | "resolvido" | "nota";

export type ApplyAchadoStateResult = {
  fotosToCleanup: { arquivoPath: string; thumbPath: string }[];
  eventoId: string | null;
};

export async function applyAchadoStateInVistoria(
  tx: Tx,
  params: {
    vistoriaId: string;
    achadoId: string;
    state: AchadoState;
    expectedUnidadeId: string;
    funcionarioOrigemId?: string | null;
  },
): Promise<ApplyAchadoStateResult> {
  const {
    vistoriaId,
    achadoId,
    state,
    expectedUnidadeId,
    funcionarioOrigemId = null,
  } = params;

  const [achadoCheck] = await tx
    .select({ unidadeId: achados.unidadeId })
    .from(achados)
    .where(eq(achados.id, achadoId))
    .limit(1);
  if (!achadoCheck || achadoCheck.unidadeId !== expectedUnidadeId) {
    throw new Error("Achado nao pertence a esta unidade.");
  }

  const existing = await tx
    .select()
    .from(achadoEventos)
    .where(
      and(
        eq(achadoEventos.achadoId, achadoId),
        eq(achadoEventos.vistoriaId, vistoriaId),
      ),
    )
    .limit(1);

  const previousTipo = existing[0]?.tipo;

  if (state === "none") {
    let fotosToCleanup: ApplyAchadoStateResult["fotosToCleanup"] = [];
    if (existing.length > 0) {
      fotosToCleanup = await tx
        .select({ arquivoPath: fotos.arquivoPath, thumbPath: fotos.thumbPath })
        .from(fotos)
        .where(eq(fotos.achadoEventoId, existing[0].id));
      await tx
        .delete(achadoEventos)
        .where(eq(achadoEventos.id, existing[0].id));
    }
    if (previousTipo === "resolvido") {
      await tx
        .update(achados)
        .set({ status: "aberto", vistoriaResolvidoId: null })
        .where(eq(achados.id, achadoId));
    }
    return { fotosToCleanup, eventoId: null };
  }

  let eventoId: string;
  if (existing.length > 0) {
    // createdAt e atualizado pra now() quando o tipo muda: o timestamp
    // representa "quando o estado atual foi registrado", entao o evento
    // resolvido/persiste deve aparecer na atividade recente com a data
    // da acao, nao a data do 'criado' original que foi sobrescrito.
    const tipoMudou = existing[0].tipo !== state;
    await tx
      .update(achadoEventos)
      .set({
        tipo: state,
        funcionarioOrigemId,
        ...(tipoMudou ? { createdAt: new Date() } : {}),
      })
      .where(eq(achadoEventos.id, existing[0].id));
    eventoId = existing[0].id;
  } else {
    const [inserted] = await tx
      .insert(achadoEventos)
      .values({
        achadoId,
        vistoriaId,
        tipo: state,
        funcionarioOrigemId,
      })
      .returning({ id: achadoEventos.id });
    eventoId = inserted.id;
  }

  if (state === "resolvido") {
    await tx
      .update(achados)
      .set({ status: "resolvido", vistoriaResolvidoId: vistoriaId })
      .where(eq(achados.id, achadoId));
  } else if (previousTipo === "resolvido") {
    // Saiu de 'resolvido' pra 'persiste'/'nota': reabre o achado.
    await tx
      .update(achados)
      .set({ status: "aberto", vistoriaResolvidoId: null })
      .where(eq(achados.id, achadoId));
  }

  return { fotosToCleanup: [], eventoId };
}
