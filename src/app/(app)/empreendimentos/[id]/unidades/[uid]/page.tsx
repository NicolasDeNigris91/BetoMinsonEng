import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc, and, count, sql } from "drizzle-orm";
import { ChevronRight, ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { db } from "@/db";
import {
  empreendimentos,
  unidades,
  vistorias,
  achados,
} from "@/db/schema";
import { formatDateBR } from "@/lib/format";
import { UnidadeFormDialog } from "../../unidade-form";
import { deleteUnidadeAction } from "../../actions";
import { NovaVistoriaDialog } from "./nova-vistoria-dialog";

export const dynamic = "force-dynamic";

export default async function UnidadeDetailPage({
  params,
}: {
  params: Promise<{ id: string; uid: string }>;
}) {
  const { id, uid } = await params;

  const [[unidade], [emp], vistoriasList, [achadosCounts]] = await Promise.all([
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
      .orderBy(desc(vistorias.data), desc(vistorias.createdAt)),
    db
      .select({
        total: count(),
        abertos: sql<number>`count(*) filter (where ${achados.status} = 'aberto')`,
        resolvidos: sql<number>`count(*) filter (where ${achados.status} = 'resolvido')`,
      })
      .from(achados)
      .where(eq(achados.unidadeId, uid)),
  ]);

  if (!unidade || !emp) notFound();

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/empreendimentos" className="hover:text-foreground">
          Empreendimentos
        </Link>
        <ChevronRight className="size-4" />
        <Link href={`/empreendimentos/${id}`} className="hover:text-foreground">
          {emp.nome}
        </Link>
        <ChevronRight className="size-4" />
        <span className="text-foreground">{unidade.nome}</span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {unidade.nome}
          </h1>
          {unidade.observacoes ? (
            <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">
              {unidade.observacoes}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">
              {Number(achadosCounts?.abertos ?? 0)} achado(s) em aberto
            </Badge>
            <Badge variant="outline">
              {Number(achadosCounts?.resolvidos ?? 0)} resolvido(s)
            </Badge>
            <Badge variant="outline">
              {vistoriasList.length} vistoria(s)
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <UnidadeFormDialog
            empreendimentoId={id}
            unidade={unidade}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil className="mr-1.5 size-4" />
                Editar
              </Button>
            }
          />
          <ConfirmDialog
            title="Excluir unidade?"
            description="Todas as vistorias, achados e fotos desta unidade serão removidos."
            confirmLabel="Excluir"
            destructive
            onConfirm={deleteUnidadeAction.bind(null, unidade.id)}
            trigger={
              <Button variant="ghost" size="sm" aria-label="Excluir unidade">
                <Trash2 className="size-4" />
              </Button>
            }
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Vistorias</h2>
          <NovaVistoriaDialog
            unidadeId={unidade.id}
            trigger={
              <Button size="sm">
                <Plus className="mr-1.5 size-4" />
                Nova vistoria
              </Button>
            }
          />
        </div>

        {vistoriasList.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="size-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhuma vistoria registrada nesta unidade.
              </p>
              <NovaVistoriaDialog
                unidadeId={unidade.id}
                trigger={
                  <Button variant="outline" size="sm" className="mt-3">
                    <Plus className="mr-1.5 size-4" />
                    Criar primeira vistoria
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {vistoriasList.map((v) => (
              <Link
                key={v.id}
                href={`/empreendimentos/${id}/unidades/${unidade.id}/vistorias/${v.id}`}
                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
              >
                <Card className="transition-colors hover:bg-accent/40">
                  <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 py-4">
                    <div>
                      <CardTitle className="text-base">
                        Vistoria de {formatDateBR(v.data)}
                      </CardTitle>
                      {v.vistoriadorNome ? (
                        <CardDescription>
                          {v.vistoriadorNome}
                        </CardDescription>
                      ) : null}
                    </div>
                    <Badge
                      variant={v.status === "finalizada" ? "default" : "secondary"}
                    >
                      {v.status === "finalizada" ? "Finalizada" : "Rascunho"}
                    </Badge>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
