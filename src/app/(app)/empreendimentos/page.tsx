import Link from "next/link";
import { desc, eq, count, sql } from "drizzle-orm";
import { Plus, Building2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import {
  achados,
  empreendimentos,
  unidades,
  vistorias,
} from "@/db/schema";
import { formatDateBR } from "@/lib/format";
import {
  ACTIVITY_STRIPE,
  activityStatus,
} from "@/lib/category-styles";
import { EmpreendimentoFormDialog } from "./empreendimento-form";

export const dynamic = "force-dynamic";

export default async function EmpreendimentosPage() {
  const [lista, unidadesRows, abertosRows, ultimasRows] = await Promise.all([
    db
      .select()
      .from(empreendimentos)
      .orderBy(desc(empreendimentos.createdAt)),
    db
      .select({
        empreendimentoId: unidades.empreendimentoId,
        n: count(),
      })
      .from(unidades)
      .groupBy(unidades.empreendimentoId),
    db
      .select({
        empreendimentoId: unidades.empreendimentoId,
        n: count(),
      })
      .from(achados)
      .innerJoin(unidades, eq(unidades.id, achados.unidadeId))
      .where(eq(achados.status, "aberto"))
      .groupBy(unidades.empreendimentoId),
    db
      .select({
        empreendimentoId: unidades.empreendimentoId,
        data: sql<string>`max(${vistorias.data})`,
      })
      .from(vistorias)
      .innerJoin(unidades, eq(unidades.id, vistorias.unidadeId))
      .groupBy(unidades.empreendimentoId),
  ]);

  const unidadesPor = new Map(
    unidadesRows.map((r) => [r.empreendimentoId, Number(r.n)]),
  );
  const abertosPor = new Map(
    abertosRows.map((r) => [r.empreendimentoId, Number(r.n)]),
  );
  const ultimaPor = new Map(ultimasRows.map((r) => [r.empreendimentoId, r.data]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em]">
            Empreendimentos
          </h1>
          <p className="text-sm text-muted-foreground">
            Cadastre cada projeto e suas unidades.
          </p>
        </div>
        <EmpreendimentoFormDialog
          trigger={
            <Button>
              <Plus className="mr-1.5 size-4" />
              Novo
            </Button>
          }
        />
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon={Building2}
          eyebrow="Nenhum empreendimento ainda"
          description="Cadastre seu primeiro projeto pra começar a registrar vistorias."
          action={
            <EmpreendimentoFormDialog
              trigger={
                <Button>
                  <Plus className="mr-1.5 size-4" />
                  Criar primeiro empreendimento
                </Button>
              }
            />
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((emp) => {
            const nUnidades = unidadesPor.get(emp.id) ?? 0;
            const nAbertos = abertosPor.get(emp.id) ?? 0;
            const ultima = ultimaPor.get(emp.id);
            const status = activityStatus(nAbertos, Boolean(ultima), 15);
            return (
              <Link
                key={emp.id}
                href={`/empreendimentos/${emp.id}`}
                className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="relative h-full overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent/40">
                  <div
                    aria-hidden
                    className={`absolute top-0 bottom-0 left-0 w-[3px] ${ACTIVITY_STRIPE[status]}`}
                  />
                  <div className="space-y-1 px-5 py-4">
                    <p className="text-base font-semibold">{emp.nome}</p>
                    {emp.cliente ? (
                      <p className="text-sm text-muted-foreground">
                        {emp.cliente}
                      </p>
                    ) : null}
                    {emp.endereco ? (
                      <p className="line-clamp-1 text-xs text-muted-foreground/80">
                        {emp.endereco}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-border/70 px-5 py-2 font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                    <span>
                      <span className="tabular-nums text-foreground">
                        {String(nUnidades).padStart(2, "0")}
                      </span>{" "}
                      unidades
                    </span>
                    <span
                      className={
                        nAbertos > 0
                          ? "text-amber-700 dark:text-amber-300"
                          : ""
                      }
                    >
                      <span className="tabular-nums">
                        {String(nAbertos).padStart(2, "0")}
                      </span>{" "}
                      abertos
                    </span>
                    <span>
                      última{" "}
                      <span className="tabular-nums text-foreground">
                        {ultima ? formatDateBR(ultima) : "—"}
                      </span>
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
