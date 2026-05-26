import type { Metadata } from "next";
import Image from "next/image";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { Lock } from "lucide-react";
import { db } from "@/db";
import {
  achadoComentarios,
  achadoEventos,
  achados,
  empreendimentos,
  escopoAchados,
  escopoShareTokens,
  escopos,
  fotos,
  unidades,
  type Categoria,
} from "@/db/schema";
import { getDateFormat } from "@/lib/date-format-server";
import { AchadoCard, type AchadoCardData } from "./achado-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ordem de serviço",
  robots: { index: false, follow: false },
};

function blockedScreen(message: string) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm text-center flex flex-col items-center">
        <Image
          src="/logo-diminson.png"
          alt="DiMinson Engenharia"
          width={300}
          height={96}
          priority
          className="h-10 w-auto mb-6"
        />
        <Lock className="size-12 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold">Link inválido ou revogado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export default async function EscopoProfissionalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [share] = await db
    .select({
      tokenId: escopoShareTokens.id,
      escopoId: escopos.id,
      escopoNome: escopos.nome,
      escopoDescricao: escopos.descricao,
      empreendimentoNome: empreendimentos.nome,
    })
    .from(escopoShareTokens)
    .innerJoin(escopos, eq(escopos.id, escopoShareTokens.escopoId))
    .innerJoin(
      empreendimentos,
      eq(empreendimentos.id, escopos.empreendimentoId),
    )
    .where(
      and(
        eq(escopoShareTokens.token, token),
        isNull(escopoShareTokens.revogadoEm),
      ),
    )
    .limit(1);

  if (!share) {
    return blockedScreen(
      "Peça a engenharia para gerar um novo link da ordem de serviço.",
    );
  }

  const dateFmt = await getDateFormat();

  // Achados do escopo + unidade. Status atual vem de achados.status — pode
  // estar resolvido por outra fonte (admin / outro escopo); a UI mostra
  // disabled nesse caso pra evitar conflito.
  const itens = await db
    .select({
      achadoId: achados.id,
      categoria: achados.categoria,
      local: achados.local,
      descricao: achados.descricao,
      status: achados.status,
      prazoEm: achados.prazoEm,
      vistoriaResolvidoId: achados.vistoriaResolvidoId,
      vistoriaOrigemId: achados.vistoriaOrigemId,
      unidadeId: unidades.id,
      unidadeNome: unidades.nome,
      unidadeOrdem: unidades.ordem,
      ordemNoEscopo: escopoAchados.ordem,
    })
    .from(escopoAchados)
    .innerJoin(achados, eq(achados.id, escopoAchados.achadoId))
    .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
    .where(eq(escopoAchados.escopoId, share.escopoId))
    .orderBy(
      asc(unidades.ordem),
      asc(unidades.nome),
      asc(escopoAchados.ordem),
    );

  if (itens.length === 0) {
    return blockedScreen(
      "Este escopo nao tem achados. Contate a engenharia.",
    );
  }

  // Eventos registrados por este escopo (achadoEventos.escopoOrigemId =
  // share.escopoId). Carrega fotos pra UI mostrar miniaturas e nota.
  // Limita aos achados do escopo (filtro IN) pra excluir eventos antigos
  // de um achado que foi removido da escopo lista.
  const achadoIds = itens.map((i) => i.achadoId);
  const eventosProfissional = await db.query.achadoEventos.findMany({
    where: and(
      eq(achadoEventos.escopoOrigemId, share.escopoId),
      inArray(achadoEventos.achadoId, achadoIds),
    ),
    with: {
      fotos: { orderBy: asc(fotos.ordem) },
    },
  });

  // Index por achadoId — escopo registra no maximo 1 evento por achado
  // (porque vai sempre na mesma vistoria origem do achado, e a unique
  // constraint achado_vistoria_unique impede mais de um).
  const eventoProfissionalPorAchado = new Map<
    string,
    (typeof eventosProfissional)[number]
  >();
  for (const ev of eventosProfissional) {
    eventoProfissionalPorAchado.set(ev.achadoId, ev);
  }

  // Comentarios do thread (engenharia ↔ profissional) pra os achados deste
  // escopo. Vem ordenados por createdAt asc — mais antigo primeiro, como
  // chat. Agrupa por achadoId pra entregar pro AchadoCard.
  const comentariosRows =
    achadoIds.length > 0
      ? await db
          .select()
          .from(achadoComentarios)
          .where(
            and(
              eq(achadoComentarios.escopoId, share.escopoId),
              inArray(achadoComentarios.achadoId, achadoIds),
            ),
          )
          .orderBy(asc(achadoComentarios.createdAt))
      : [];
  const comentariosPorAchado = new Map<string, typeof comentariosRows>();
  for (const c of comentariosRows) {
    const arr = comentariosPorAchado.get(c.achadoId) ?? [];
    arr.push(c);
    comentariosPorAchado.set(c.achadoId, arr);
  }

  // Foto original do problema = primeiro evento "criado" do achado, com
  // suas fotos. Mostra na UI pra dar contexto visual ao profissional.
  const eventosCriado = await db.query.achadoEventos.findMany({
    where: and(
      inArray(achadoEventos.achadoId, achadoIds),
      eq(achadoEventos.tipo, "criado"),
    ),
    with: {
      fotos: { orderBy: asc(fotos.ordem) },
    },
  });
  const fotosOrigemPorAchado = new Map<
    string,
    { id: string; thumbPath: string }[]
  >();
  for (const ev of eventosCriado) {
    fotosOrigemPorAchado.set(
      ev.achadoId,
      ev.fotos.map((f) => ({ id: f.id, thumbPath: f.thumbPath })),
    );
  }

  // Agrupa por unidade pra render.
  type ItemRow = (typeof itens)[number];
  const grupos = new Map<
    string,
    { unidadeId: string; unidadeNome: string; itens: ItemRow[] }
  >();
  for (const it of itens) {
    const g = grupos.get(it.unidadeId);
    if (g) {
      g.itens.push(it);
    } else {
      grupos.set(it.unidadeId, {
        unidadeId: it.unidadeId,
        unidadeNome: it.unidadeNome,
        itens: [it],
      });
    }
  }
  const grupoArray = Array.from(grupos.values());

  // Contadores pro header.
  let tratados = 0;
  for (const it of itens) {
    const ev = eventoProfissionalPorAchado.get(it.achadoId);
    if (ev) tratados++;
  }
  const pendentes = itens.length - tratados;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-t-2 border-t-foreground border-b bg-background">
        <div className="mx-auto max-w-3xl px-4 py-4 space-y-2">
          <Image
            src="/logo-diminson.png"
            alt="DiMinson Engenharia"
            width={300}
            height={96}
            priority
            className="h-8 w-auto"
          />
          <div>
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              Ordem de servico
            </p>
            <h1 className="mt-0.5 text-[20px] font-extrabold leading-tight tracking-[-0.015em]">
              {share.escopoNome}
            </h1>
            <p className="text-sm text-muted-foreground">
              {share.empreendimentoNome}
            </p>
            {share.escopoDescricao ? (
              <p className="mt-2 text-sm whitespace-pre-line text-foreground/80">
                {share.escopoDescricao}
              </p>
            ) : null}
            <p className="mt-2 font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
              <span className="tabular-nums text-foreground">
                {String(pendentes).padStart(2, "0")}
              </span>{" "}
              pendente{pendentes === 1 ? "" : "s"} ·{" "}
              <span className="tabular-nums text-foreground">
                {String(tratados).padStart(2, "0")}
              </span>{" "}
              ja tratado{tratados === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4 space-y-4">
        {grupoArray.map((g) => (
          <section key={g.unidadeId} className="space-y-2">
            <h2 className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground px-1">
              {g.unidadeNome} ·{" "}
              <span className="tabular-nums">
                {String(g.itens.length).padStart(2, "0")}
              </span>{" "}
              achado{g.itens.length === 1 ? "" : "s"}
            </h2>
            <ul className="space-y-3">
              {g.itens.map((it) => {
                const ev = eventoProfissionalPorAchado.get(it.achadoId);
                const tratadoPorEsteFluxo =
                  Boolean(ev) &&
                  (ev?.tipo === "resolvido" || ev?.tipo === "persiste");
                // Resolvido em outro contexto = status resolvido E nao foi
                // este escopo que marcou (ev pode ser null OU ter tipo
                // diferente de 'resolvido' — ex: persiste).
                const resolvidoEmOutro =
                  it.status === "resolvido" && ev?.tipo !== "resolvido";

                const data: AchadoCardData = {
                  achadoId: it.achadoId,
                  categoria: it.categoria as Categoria,
                  local: it.local,
                  descricao: it.descricao,
                  prazoEm: it.prazoEm,
                  fotosOrigem: fotosOrigemPorAchado.get(it.achadoId) ?? [],
                  evento: ev
                    ? {
                        id: ev.id,
                        tipo: ev.tipo as "resolvido" | "persiste",
                        notaExtra: ev.notaExtra,
                        fotos: ev.fotos.map((f) => ({
                          id: f.id,
                          thumbPath: f.thumbPath,
                          arquivoPath: f.arquivoPath,
                        })),
                      }
                    : null,
                  comentarios: (comentariosPorAchado.get(it.achadoId) ?? []).map(
                    (c) => ({
                      id: c.id,
                      autor: c.autor,
                      texto: c.texto,
                      createdAt: c.createdAt,
                    }),
                  ),
                  tratadoPorEsteFluxo,
                  resolvidoEmOutro,
                };

                return (
                  <li key={it.achadoId}>
                    <AchadoCard
                      token={token}
                      data={data}
                      escopoNome={share.escopoNome}
                      dateFmt={dateFmt}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>

      <footer className="border-t bg-background mt-6">
        <div className="mx-auto max-w-3xl px-4 py-4 text-center text-xs text-muted-foreground space-y-1">
          <p>
            As alteracoes feitas aqui aparecem imediatamente no sistema da
            engenharia.
          </p>
          <p className="pt-1 font-mono text-[10px] tracking-[0.18em] uppercase">
            DiMinson Engenharia · Ordens de servico
          </p>
        </div>
      </footer>
    </div>
  );
}
