import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { ChevronRight, Home, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { db } from "@/db";
import { empreendimentos, unidades } from "@/db/schema";
import { EmpreendimentoFormDialog } from "../empreendimento-form";
import { deleteEmpreendimentoAction } from "../actions";
import { UnidadeFormDialog } from "./unidade-form";

export const dynamic = "force-dynamic";

export default async function EmpreendimentoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [emp] = await db
    .select()
    .from(empreendimentos)
    .where(eq(empreendimentos.id, id))
    .limit(1);

  if (!emp) {
    notFound();
  }

  const lista = await db
    .select()
    .from(unidades)
    .where(eq(unidades.empreendimentoId, id))
    .orderBy(asc(unidades.ordem), asc(unidades.nome));

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/empreendimentos" className="hover:text-foreground">
          Empreendimentos
        </Link>
        <ChevronRight className="size-4" />
        <span className="text-foreground">{emp.nome}</span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{emp.nome}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {emp.cliente ? <span>Cliente: {emp.cliente}</span> : null}
            {emp.endereco ? <span>{emp.endereco}</span> : null}
          </div>
          {emp.observacoes ? (
            <p className="mt-2 text-sm whitespace-pre-line">{emp.observacoes}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <EmpreendimentoFormDialog
            empreendimento={emp}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil className="mr-1.5 size-4" />
                Editar
              </Button>
            }
          />
          <ConfirmDialog
            title="Excluir empreendimento?"
            description="Todos os dados (unidades, vistorias, achados, fotos) serão removidos permanentemente."
            confirmLabel="Excluir tudo"
            destructive
            onConfirm={deleteEmpreendimentoAction.bind(null, emp.id)}
            trigger={
              <Button variant="ghost" size="sm">
                <Trash2 className="size-4" />
              </Button>
            }
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Unidades</h2>
          <UnidadeFormDialog
            empreendimentoId={emp.id}
            trigger={
              <Button size="sm">
                <Plus className="mr-1.5 size-4" />
                Nova unidade
              </Button>
            }
          />
        </div>

        {lista.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Home className="size-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhuma unidade cadastrada.
              </p>
              <UnidadeFormDialog
                empreendimentoId={emp.id}
                trigger={
                  <Button variant="outline" size="sm" className="mt-3">
                    <Plus className="mr-1.5 size-4" />
                    Adicionar unidade
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((un) => (
              <Link
                key={un.id}
                href={`/empreendimentos/${emp.id}/unidades/${un.id}`}
                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
              >
                <Card className="h-full transition-colors hover:bg-accent/40">
                  <CardHeader>
                    <CardTitle className="text-base">{un.nome}</CardTitle>
                    {un.observacoes ? (
                      <CardDescription className="line-clamp-2">
                        {un.observacoes}
                      </CardDescription>
                    ) : null}
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
