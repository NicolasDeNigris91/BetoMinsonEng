import Image from "next/image";
import { and, asc, eq, gt } from "drizzle-orm";
import { Lock } from "lucide-react";
import { db } from "@/db";
import {
  achadoEventos,
  empreendimentos,
  fotos,
  shareTokens,
  unidades,
  vistorias,
} from "@/db/schema";
import { formatDateBR } from "@/lib/format";
import { MobileUploader } from "./mobile-uploader";

export const dynamic = "force-dynamic";

export default async function MobileUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [share] = await db
    .select()
    .from(shareTokens)
    .where(
      and(
        eq(shareTokens.token, token),
        eq(shareTokens.permiteUpload, true),
        gt(shareTokens.expiraEm, new Date()),
      ),
    )
    .limit(1);

  if (!share) {
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
            Link inválido ou expirado
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Peça à engenharia para gerar um novo link de upload na vistoria.
          </p>
        </div>
      </div>
    );
  }

  const [vistoria] = await db
    .select()
    .from(vistorias)
    .where(eq(vistorias.id, share.vistoriaId))
    .limit(1);

  if (!vistoria) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Vistoria não encontrada.
      </p>
    );
  }

  if (vistoria.status === "finalizada") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold">Vistoria finalizada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Não é possível adicionar fotos a uma vistoria finalizada. Reabra
            pelo desktop antes de continuar.
          </p>
        </div>
      </div>
    );
  }

  const [[unidade], empRow, eventos] = await Promise.all([
    db
      .select()
      .from(unidades)
      .where(eq(unidades.id, vistoria.unidadeId))
      .limit(1),
    db
      .select()
      .from(empreendimentos)
      .innerJoin(unidades, eq(unidades.empreendimentoId, empreendimentos.id))
      .where(eq(unidades.id, vistoria.unidadeId))
      .limit(1),
    db.query.achadoEventos.findMany({
      where: eq(achadoEventos.vistoriaId, vistoria.id),
      with: {
        fotos: { orderBy: asc(fotos.ordem) },
        achado: true,
      },
      orderBy: asc(achadoEventos.createdAt),
    }),
  ]);
  const emp = empRow[0]?.empreendimentos;

  const items = eventos
    .filter((ev) => ev.achado != null)
    .map((ev) => ({
      eventoId: ev.id,
      categoria: ev.achado!.categoria,
      local: ev.achado!.local,
      descricao: ev.achado!.descricao,
      fotos: ev.fotos.map((f) => ({
        id: f.id,
        thumbPath: f.thumbPath,
      })),
    }));

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b">
        <div className="mx-auto max-w-2xl px-4 py-4 space-y-2">
          <Image
            src="/logo-diminson.png"
            alt="DiMinson Engenharia"
            width={300}
            height={96}
            priority
            className="h-8 w-auto"
          />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Modo celular · upload de fotos
            </p>
            <h1 className="text-lg font-semibold mt-0.5">
              {emp?.nome ?? "Empreendimento"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {unidade?.nome ?? ""} · {formatDateBR(vistoria.data)}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        <MobileUploader token={token} items={items} />
      </main>
    </div>
  );
}
