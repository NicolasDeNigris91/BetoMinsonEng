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
    // Pode existir um token de leitura ativo pra mesma vistoria —
    // entrega o link como saida em vez de deixar o cliente preso.
    const [leitura] = await db
      .select({ token: shareTokens.token })
      .from(shareTokens)
      .where(
        and(
          eq(shareTokens.vistoriaId, vistoria.id),
          eq(shareTokens.permiteUpload, false),
          gt(shareTokens.expiraEm, new Date()),
        ),
      )
      .limit(1);
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center flex flex-col items-center gap-3">
          <Image
            src="/logo-diminson.png"
            alt="DiMinson Engenharia"
            width={300}
            height={96}
            priority
            className="h-10 w-auto mb-2"
          />
          <h1 className="text-lg font-semibold">Vistoria finalizada</h1>
          <p className="text-sm text-muted-foreground">
            Não é possível adicionar fotos a uma vistoria finalizada. A
            engenharia precisa reabrir pelo desktop antes de continuar.
          </p>
          {leitura ? (
            <a
              href={`/v/${leitura.token}`}
              className="mt-2 inline-block rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Ver relatório da vistoria
            </a>
          ) : null}
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

  // Achado resolvido nesta mesma vistoria nao deve aparecer pra upload —
  // a UI mobile so faz sentido pra registrar foto de pendencia. Filtra
  // pelo status atual do achado e dedup por achadoId (um achado pode ter
  // mais de um evento na vistoria: ex. 'persiste' + 'nota').
  const eventoPorAchado = new Map<string, (typeof eventos)[number]>();
  for (const ev of eventos) {
    if (!ev.achado || ev.achado.status !== "aberto") continue;
    const existing = eventoPorAchado.get(ev.achadoId);
    if (!existing || existing.createdAt < ev.createdAt) {
      eventoPorAchado.set(ev.achadoId, ev);
    }
  }
  const items = Array.from(eventoPorAchado.values()).map((ev) => ({
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
      <header className="border-t-2 border-t-foreground border-b bg-background">
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
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
              Modo celular · upload de fotos
            </p>
            <h1 className="mt-0.5 text-[20px] font-extrabold leading-tight tracking-[-0.015em]">
              {emp?.nome ?? "Empreendimento"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {unidade?.nome ?? ""} ·{" "}
              <span className="font-tech">{formatDateBR(vistoria.data)}</span>
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
