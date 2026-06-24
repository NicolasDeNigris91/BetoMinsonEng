import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq, asc, sql, and } from "drizzle-orm";
import { ClipboardList } from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { db } from "@/db";
import {
  achados,
  empreendimentos,
  funcionarioAchados,
  funcionarios,
  unidades,
} from "@/db/schema";
import { env } from "@/lib/env";
import { parseUuidOrNotFound } from "@/lib/route-params";
import { FuncionarioSharePanel } from "./share-panel";
import { HeaderActionsMenu } from "./header-actions-menu";
import {
  AtribuirAchadosDialog,
  type EmpreendimentoDisponivel,
} from "./atribuir-achados-dialog";
import { AchadosList, type AchadoGrupo } from "./achados-list";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: rawId } = await params;
  if (!rawId) return { title: "Funcionário" };
  try {
    const id = parseUuidOrNotFound(rawId);
    const [row] = await db
      .select({ nome: funcionarios.nome })
      .from(funcionarios)
      .where(eq(funcionarios.id, id))
      .limit(1);
    return { title: row?.nome ?? "Funcionário" };
  } catch {
    return { title: "Funcionário" };
  }
}

export default async function FuncionarioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = parseUuidOrNotFound(rawId);

  const [funcionario] = await db
    .select()
    .from(funcionarios)
    .where(eq(funcionarios.id, id))
    .limit(1);

  if (!funcionario) notFound();

  const atribuidos = await db
    .select({
      achadoId: achados.id,
      categoria: achados.categoria,
      local: achados.local,
      descricao: achados.descricao,
      status: achados.status,
      prazoEm: achados.prazoEm,
      prioridade: funcionarioAchados.prioridade,
      atribuidoEm: funcionarioAchados.atribuidoEm,
      unidadeId: unidades.id,
      unidadeNome: unidades.nome,
      empreendimentoId: empreendimentos.id,
      empreendimentoNome: empreendimentos.nome,
    })
    .from(funcionarioAchados)
    .innerJoin(achados, eq(achados.id, funcionarioAchados.achadoId))
    .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
    .innerJoin(empreendimentos, eq(empreendimentos.id, unidades.empreendimentoId))
    .where(eq(funcionarioAchados.funcionarioId, id))
    .orderBy(asc(empreendimentos.nome), asc(unidades.ordem), asc(achados.ordem));

  const disponiveisRaw = await db
    .select({
      id: empreendimentos.id,
      nome: empreendimentos.nome,
      disponiveis: sql<number>`count(*) filter (
        where ${achados.status} = 'aberto'
        and ${funcionarioAchados.funcionarioId} is null
      )::int`,
    })
    .from(empreendimentos)
    .leftJoin(unidades, eq(unidades.empreendimentoId, empreendimentos.id))
    .leftJoin(achados, eq(achados.unidadeId, unidades.id))
    .leftJoin(
      funcionarioAchados,
      and(
        eq(funcionarioAchados.achadoId, achados.id),
        eq(funcionarioAchados.funcionarioId, id),
      ),
    )
    .groupBy(empreendimentos.id, empreendimentos.nome)
    .orderBy(asc(empreendimentos.nome));

  const empreendimentosDisponiveis: EmpreendimentoDisponivel[] = disponiveisRaw
    .filter((d) => Number(d.disponiveis) > 0)
    .map((d) => ({
      id: d.id,
      nome: d.nome,
      disponiveis: Number(d.disponiveis),
    }));

  const porEmp = new Map<
    string,
    {
      empreendimentoId: string;
      empreendimentoNome: string;
      unidades: Map<
        string,
        {
          unidadeId: string;
          unidadeNome: string;
          itens: typeof atribuidos;
        }
      >;
    }
  >();
  for (const a of atribuidos) {
    let g = porEmp.get(a.empreendimentoId);
    if (!g) {
      g = {
        empreendimentoId: a.empreendimentoId,
        empreendimentoNome: a.empreendimentoNome,
        unidades: new Map(),
      };
      porEmp.set(a.empreendimentoId, g);
    }
    const u = g.unidades.get(a.unidadeId);
    if (u) u.itens.push(a);
    else
      g.unidades.set(a.unidadeId, {
        unidadeId: a.unidadeId,
        unidadeNome: a.unidadeNome,
        itens: [a],
      });
  }
  const grupos = Array.from(porEmp.values()).map((g) => ({
    ...g,
    unidades: Array.from(g.unidades.values()),
  }));

  const totalEmp = grupos.length;
  const desativado = funcionario.desativadoEm !== null;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Funcionários", href: "/funcionarios" },
          { label: funcionario.nome },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
            {funcionario.nome}
          </h1>
          <p className="mt-2 font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground">
            <span className="tabular-nums text-foreground">
              {String(atribuidos.length).padStart(2, "0")}
            </span>{" "}
            {atribuidos.length === 1 ? "achado" : "achados"} ·{" "}
            <span className="tabular-nums text-foreground">
              {String(totalEmp).padStart(2, "0")}
            </span>{" "}
            {totalEmp === 1 ? "empreendimento" : "empreendimentos"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {atribuidos.length > 0 ? (
            <AtribuirAchadosDialog
              funcionarioId={funcionario.id}
              empreendimentos={empreendimentosDisponiveis}
              primary
            />
          ) : null}
          <HeaderActionsMenu funcionario={funcionario} />
        </div>
      </div>

      <FuncionarioSharePanel
        funcionarioId={funcionario.id}
        baseUrl={env.BASE_URL}
        token={funcionario.token}
        desativado={desativado}
      />

      <section className="space-y-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[12px] font-semibold tracking-[0.04em] uppercase text-foreground/80">
            Achados atribuídos
          </h2>
        </div>

        {atribuidos.length === 0 ? (
          <div className="bp-grid-strong relative overflow-hidden rounded-lg border bg-card">
            <div className="mx-auto flex max-w-md flex-col items-center justify-center px-6 py-10 text-center">
              <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3">
                <ClipboardList
                  className="size-6 text-muted-foreground/60"
                  aria-hidden
                />
              </div>
              <p className="mt-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                Sem achados atribuídos
              </p>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">
                Atribua achados de qualquer empreendimento pra começar.
              </p>
              <AtribuirAchadosDialog
                funcionarioId={funcionario.id}
                empreendimentos={empreendimentosDisponiveis}
                primary
              />
            </div>
          </div>
        ) : (
          <AchadosList
            funcionarioId={funcionario.id}
            grupos={grupos as unknown as AchadoGrupo[]}
          />
        )}
      </section>
    </div>
  );
}
