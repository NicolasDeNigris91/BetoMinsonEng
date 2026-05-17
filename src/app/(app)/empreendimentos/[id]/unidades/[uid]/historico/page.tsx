import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { ClipboardList } from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { EmptyState } from "@/components/empty-state";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  empreendimentos,
  unidades,
  vistorias,
} from "@/db/schema";
import { formatDate } from "@/lib/format";
import { getDateFormat } from "@/lib/date-format-server";
import { parseUuidOrNotFound } from "@/lib/route-params";
import {
  HistoricoView,
  type DayGroup,
  type HistoricoItem,
} from "./historico-view";

export const dynamic = "force-dynamic";

/**
 * Calcula label relativa pro grupo de dia. Usa data ISO YYYY-MM-DD.
 * "hoje" / "ontem" / "ha N dias" / "ha N meses".
 */
function relLabel(dia: string, hoje: Date): string {
  const [y, m, d] = dia.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const todayUTC = new Date(
    Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()),
  );
  const diff = Math.round(
    (todayUTC.getTime() - date.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diff <= 0) return "hoje";
  if (diff === 1) return "ontem";
  if (diff < 30) return `há ${diff} dias`;
  if (diff < 60) return "há 1 mês";
  return `há ${Math.floor(diff / 30)} meses`;
}

function isoDay(d: Date): string {
  // YYYY-MM-DD no fuso local — mesmos cards/datas que o resto da app usa
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function HistoricoUnidadePage({
  params,
}: {
  params: Promise<{ id: string; uid: string }>;
}) {
  const { id: rawId, uid: rawUid } = await params;
  const id = parseUuidOrNotFound(rawId);
  const uid = parseUuidOrNotFound(rawUid);
  const dateFmt = await getDateFormat();

  const [[unidade], [emp], vistoriasList, eventosList] = await Promise.all([
    db
      .select()
      .from(unidades)
      .where(and(eq(unidades.id, uid), eq(unidades.empreendimentoId, id)))
      .limit(1),
    db
      .select()
      .from(empreendimentos)
      .where(eq(empreendimentos.id, id))
      .limit(1),
    db
      .select()
      .from(vistorias)
      .where(eq(vistorias.unidadeId, uid))
      .orderBy(asc(vistorias.createdAt)),
    db
      .select({
        id: achadoEventos.id,
        createdAt: achadoEventos.createdAt,
        tipo: achadoEventos.tipo,
        notaExtra: achadoEventos.notaExtra,
        vistoriaId: achadoEventos.vistoriaId,
        vistoriaData: vistorias.data,
        vistoriador: vistorias.vistoriadorNome,
        categoria: achados.categoria,
        local: achados.local,
        descricao: achados.descricao,
      })
      .from(achadoEventos)
      .innerJoin(achados, eq(achados.id, achadoEventos.achadoId))
      .innerJoin(vistorias, eq(vistorias.id, achadoEventos.vistoriaId))
      .where(eq(vistorias.unidadeId, uid))
      .orderBy(desc(achadoEventos.createdAt)),
  ]);

  if (!unidade || !emp) notFound();

  const items: HistoricoItem[] = [];
  for (const v of vistoriasList) {
    items.push({
      kind: "vistoria-criada",
      at: v.createdAt.toISOString(),
      vistoriaId: v.id,
      data: v.data,
      vistoriador: v.vistoriadorNome,
    });
    if (v.finalizadaEm) {
      items.push({
        kind: "vistoria-finalizada",
        at: v.finalizadaEm.toISOString(),
        vistoriaId: v.id,
        data: v.data,
      });
    }
  }
  for (const ev of eventosList) {
    items.push({
      kind: "evento",
      at: ev.createdAt.toISOString(),
      vistoriaId: ev.vistoriaId,
      vistoriaData: ev.vistoriaData,
      tipo: ev.tipo,
      categoria: ev.categoria,
      local: ev.local,
      descricao: ev.descricao,
      notaExtra: ev.notaExtra,
      vistoriador: ev.vistoriador,
    });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : -1));

  // Agrupa por dia (YYYY-MM-DD) — labels calculadas no server pra evitar
  // hydration mismatch entre fuso do server e do cliente.
  const hoje = new Date();
  const groupsMap = new Map<string, HistoricoItem[]>();
  for (const it of items) {
    const dia = isoDay(new Date(it.at));
    const arr = groupsMap.get(dia) ?? [];
    arr.push(it);
    groupsMap.set(dia, arr);
  }
  // Ordena os dias mais recentes primeiro
  const groups: DayGroup[] = Array.from(groupsMap.entries())
    .sort(([a], [b]) => (a > b ? -1 : 1))
    .map(([dia, dayItems]) => ({
      dia,
      rel: relLabel(dia, hoje),
      dataBR: formatDate(dia, dateFmt),
      items: dayItems,
    }));

  const totalVistorias = vistoriasList.length;
  const totalEventos = eventosList.length;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Empreendimentos", href: "/empreendimentos" },
          { label: emp.nome, href: `/empreendimentos/${id}` },
          {
            label: unidade.nome,
            href: `/empreendimentos/${id}/unidades/${uid}`,
          },
          { label: "Histórico" },
        ]}
      />

      {items.length === 0 ? (
        <>
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
            Histórico de {unidade.nome}
          </h1>
          <EmptyState
            icon={ClipboardList}
            eyebrow="Sem histórico"
            description="Crie uma vistoria pra começar."
          />
        </>
      ) : (
        <HistoricoView
          empreendimentoId={id}
          unidadeId={uid}
          totalEventos={totalEventos}
          totalVistorias={totalVistorias}
          groups={groups}
        />
      )}
    </div>
  );
}
