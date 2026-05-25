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

/**
 * Nucleo da transicao de estado de um achado numa vistoria. Cria/atualiza/
 * apaga o achadoEvento correspondente e ajusta achados.status quando o
 * estado vai/sai de 'resolvido'.
 *
 * Reutilizado por dois callers:
 *  - server action admin (`setAchadoStateInVistoriaAction`): escopoOrigemId
 *    fica null/undefined — registro padrao de inspecao.
 *  - server action publica via token (link do profissional do escopo):
 *    passa escopoOrigemId pra identificar a procedencia do evento na
 *    timeline (chip "via escopo: X").
 *
 * IMPORTANTE: nao chama deleteFotosFromStorage. Apenas devolve a lista
 * de paths pra o caller apagar do disco APOS o commit (transacao nao
 * deve fazer IO fora do banco).
 */
export async function applyAchadoStateInVistoria(
  tx: Tx,
  params: {
    vistoriaId: string;
    achadoId: string;
    state: AchadoState;
    /** Authz: garante que o achado pertence a unidade esperada. */
    expectedUnidadeId: string;
    /** Marca o evento como vindo de um escopo (link do profissional). */
    escopoOrigemId?: string | null;
  },
): Promise<ApplyAchadoStateResult> {
  const {
    vistoriaId,
    achadoId,
    state,
    expectedUnidadeId,
    escopoOrigemId = null,
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
    // Preserva fotos e notaExtra — atualiza tipo (e escopoOrigemId, se
    // a operacao veio de um escopo diferente do registrado antes).
    //
    // createdAt e atualizado pra now() quando o tipo muda: o timestamp
    // representa "quando o estado atual foi registrado", entao o evento
    // resolvido/persiste deve aparecer na atividade recente com a data
    // da acao, nao a data do 'criado' original que foi sobrescrito.
    const tipoMudou = existing[0].tipo !== state;
    await tx
      .update(achadoEventos)
      .set({
        tipo: state,
        escopoOrigemId,
        ...(tipoMudou ? { createdAt: new Date() } : {}),
      })
      .where(eq(achadoEventos.id, existing[0].id));
    eventoId = existing[0].id;
  } else {
    const [inserted] = await tx
      .insert(achadoEventos)
      .values({ achadoId, vistoriaId, tipo: state, escopoOrigemId })
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
