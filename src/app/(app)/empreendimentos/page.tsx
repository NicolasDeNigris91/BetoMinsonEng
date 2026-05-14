import Link from "next/link";
import { desc } from "drizzle-orm";
import { Plus, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { empreendimentos } from "@/db/schema";
import { EmpreendimentoFormDialog } from "./empreendimento-form";

export const dynamic = "force-dynamic";

export default async function EmpreendimentosPage() {
  const lista = await db
    .select()
    .from(empreendimentos)
    .orderBy(desc(empreendimentos.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
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
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="size-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhum empreendimento cadastrado ainda.
            </p>
            <EmpreendimentoFormDialog
              trigger={
                <Button className="mt-4">
                  <Plus className="mr-1.5 size-4" />
                  Criar primeiro empreendimento
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((emp) => (
            <Link
              key={emp.id}
              href={`/empreendimentos/${emp.id}`}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
            >
              <Card className="h-full transition-colors hover:bg-accent/40">
                <CardHeader>
                  <CardTitle className="text-base">{emp.nome}</CardTitle>
                  {emp.cliente ? (
                    <CardDescription>{emp.cliente}</CardDescription>
                  ) : null}
                </CardHeader>
                {emp.endereco ? (
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {emp.endereco}
                    </p>
                  </CardContent>
                ) : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
