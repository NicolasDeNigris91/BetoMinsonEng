import type { Metadata } from "next";
import Image from "next/image";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Lock } from "lucide-react";
import { db } from "@/db";
import {
  achadoEventos,
  achados,
  empreendimentos,
  fotos,
  funcionarioAchados,
  funcionarios,
  mensagens,
  unidades,
  type Categoria,
} from "@/db/schema";
import {
  EmpreendimentoTabs,
  type EmpreendimentoGroup,
  type UnidadeGroup,
} from "./empreendimento-tabs";
import type { AchadoCardData } from "./achado-card";
import { EngenhariaProvider } from "./engenharia-context";
import { EngenhariaSheet } from "./engenharia-sheet";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Meus achados",
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
        <h1 className="mt-4 text-lg font-semibold">
          Link inválido ou desativado
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export default async function FuncionarioPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [funcionario] = await db
    .select({
      id: funcionarios.id,
      nome: funcionarios.nome,
    })
    .from(funcionarios)
    .where(
      and(eq(funcionarios.token, token), isNull(funcionarios.desativadoEm)),
    )
    .limit(1);

  if (!funcionario) {
    return blockedScreen("Peça à engenharia para gerar um novo link.");
  }

  const [{ n: mensagensNaoLidas }] = await db
    .select({
      n: sql<number>`count(*) filter (where ${mensagens.autor} = 'engenharia' and ${mensagens.lidoEm} is null)::int`,
    })
    .from(mensagens)
    .where(eq(mensagens.funcionarioId, funcionario.id));

  const itens = await db
    .select({
      achadoId: achados.id,
      categoria: achados.categoria,
      local: achados.local,
      descricao: achados.descricao,
      status: achados.status,
      prazoEm: achados.prazoEm,
      vistoriaOrigemId: achados.vistoriaOrigemId,
      unidadeId: unidades.id,
      unidadeNome: unidades.nome,
      unidadeOrdem: unidades.ordem,
      empreendimentoId: empreendimentos.id,
      empreendimentoNome: empreendimentos.nome,
      atribuidoEm: funcionarioAchados.atribuidoEm,
      prioridade: funcionarioAchados.prioridade,
    })
    .from(funcionarioAchados)
    .innerJoin(achados, eq(achados.id, funcionarioAchados.achadoId))
    .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
    .innerJoin(
      empreendimentos,
      eq(empreendimentos.id, unidades.empreendimentoId),
    )
    .where(eq(funcionarioAchados.funcionarioId, funcionario.id))
    .orderBy(
      asc(empreendimentos.nome),
      asc(unidades.ordem),
      sql`case ${funcionarioAchados.prioridade} when 'alta' then 0 when 'media' then 1 else 2 end`,
      asc(achados.ordem),
    );

  if (itens.length === 0) {
    return blockedScreen(
      "Nenhum achado atribuído ainda. Contate a engenharia.",
    );
  }

  const achadoIds = itens.map((i) => i.achadoId);

  const eventosFuncionario = await db.query.achadoEventos.findMany({
    where: and(
      eq(achadoEventos.funcionarioOrigemId, funcionario.id),
      inArray(achadoEventos.achadoId, achadoIds),
    ),
    with: {
      fotos: { orderBy: asc(fotos.ordem) },
    },
  });
  const eventoPorAchado = new Map<
    string,
    (typeof eventosFuncionario)[number]
  >();
  for (const ev of eventosFuncionario) {
    eventoPorAchado.set(ev.achadoId, ev);
  }

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

  const porEmp = new Map<
    string,
    {
      empreendimentoId: string;
      empreendimentoNome: string;
      unidades: Map<string, UnidadeGroup>;
    }
  >();

  let resolvidos = 0;
  let pendentes = 0;

  for (const it of itens) {
    const ev = eventoPorAchado.get(it.achadoId);
    const tratadoPorEsteFluxo =
      Boolean(ev) && (ev?.tipo === "resolvido" || ev?.tipo === "persiste");
    const resolvidoEmOutro =
      it.status === "resolvido" && ev?.tipo !== "resolvido";

    // Persiste continua actionable (foto/nota); so resolvido sai da lista.
    const isResolvido = ev?.tipo === "resolvido" || resolvidoEmOutro;
    if (isResolvido) resolvidos++;
    else pendentes++;

    const cardData: AchadoCardData = {
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
      tratadoPorEsteFluxo,
      resolvidoEmOutro,
      prioridade: it.prioridade,
    };

    let g = porEmp.get(it.empreendimentoId);
    if (!g) {
      g = {
        empreendimentoId: it.empreendimentoId,
        empreendimentoNome: it.empreendimentoNome,
        unidades: new Map(),
      };
      porEmp.set(it.empreendimentoId, g);
    }
    const u = g.unidades.get(it.unidadeId);
    if (u) u.itens.push(cardData);
    else
      g.unidades.set(it.unidadeId, {
        unidadeId: it.unidadeId,
        unidadeNome: it.unidadeNome,
        itens: [cardData],
      });
  }

  const grupos: EmpreendimentoGroup[] = Array.from(porEmp.values()).map(
    (g) => {
      const unidadesArr = Array.from(g.unidades.values());
      const totalAchados = unidadesArr.reduce(
        (s, u) => s + u.itens.length,
        0,
      );
      const totalResolvidos = unidadesArr.reduce(
        (s, u) =>
          s +
          u.itens.filter(
            (it) => it.resolvidoEmOutro || it.evento?.tipo === "resolvido",
          ).length,
        0,
      );
      const totalPendentes = totalAchados - totalResolvidos;
      return {
        empreendimentoId: g.empreendimentoId,
        empreendimentoNome: g.empreendimentoNome,
        unidades: unidadesArr,
        totalAchados,
        totalPendentes,
        totalResolvidos,
      };
    },
  );

  return (
    <EngenhariaProvider>
    <div className="min-h-screen bg-muted/30">
      <header className="border-t-2 border-t-foreground border-b bg-background">
        <div className="mx-auto max-w-3xl px-4 py-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <Image
              src="/logo-diminson.png"
              alt="DiMinson Engenharia"
              width={300}
              height={96}
              priority
              className="h-8 w-auto"
            />
            <EngenhariaSheet
              token={token}
              naoLidasIniciais={Number(mensagensNaoLidas)}
            />
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              Trabalho de campo
            </p>
            <h1 className="mt-0.5 text-[20px] font-extrabold leading-tight tracking-[-0.015em]">
              {funcionario.nome}
            </h1>
            <p className="mt-2 font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
              <span className="tabular-nums text-foreground">
                {String(pendentes).padStart(2, "0")}
              </span>{" "}
              pendente{pendentes === 1 ? "" : "s"} ·{" "}
              <span className="tabular-nums text-foreground">
                {String(resolvidos).padStart(2, "0")}
              </span>{" "}
              resolvido{resolvidos === 1 ? "" : "s"} ·{" "}
              <span className="tabular-nums text-foreground">
                {String(grupos.length).padStart(2, "0")}
              </span>{" "}
              empreendimento{grupos.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        <EmpreendimentoTabs token={token} grupos={grupos} />
      </main>

      <footer className="border-t bg-background mt-6">
        <div className="mx-auto max-w-3xl px-4 py-4 text-center text-xs text-muted-foreground space-y-1">
          <p>
            As alterações feitas aqui aparecem imediatamente no sistema da
            engenharia.
          </p>
          <p className="pt-1 font-mono text-[10px] tracking-[0.18em] uppercase">
            DiMinson Engenharia · Trabalho de campo
          </p>
        </div>
      </footer>
    </div>
    </EngenhariaProvider>
  );
}
