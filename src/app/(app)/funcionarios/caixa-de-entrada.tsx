"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FuncionarioRich } from "./dashboard-data";
import { ThreadDialog } from "./thread-dialog";

type Props = {
  funcionarios: FuncionarioRich[];
};

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = ms / 60000;
  if (min < 1) return "agora";
  if (min < 60) return `há ${Math.floor(min)}min`;
  const h = min / 60;
  if (h < 24) return `há ${Math.floor(h)}h`;
  const d = h / 24;
  if (d < 30) return `há ${Math.floor(d)}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function CaixaDeEntrada({ funcionarios }: Props) {
  const [aberto, setAberto] = useState<{ id: string; nome: string } | null>(
    null,
  );

  const comThread = funcionarios
    .filter((f) => f.ultimaMensagemEm !== null)
    .sort((a, b) => {
      if (a.mensagensNaoLidas > 0 && b.mensagensNaoLidas === 0) return -1;
      if (a.mensagensNaoLidas === 0 && b.mensagensNaoLidas > 0) return 1;
      const ta = a.ultimaMensagemEm ? new Date(a.ultimaMensagemEm).getTime() : 0;
      const tb = b.ultimaMensagemEm ? new Date(b.ultimaMensagemEm).getTime() : 0;
      return tb - ta;
    });

  const totalNaoLidas = funcionarios.reduce(
    (s, f) => s + f.mensagensNaoLidas,
    0,
  );

  const iniciais = (nome: string) =>
    nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("");

  if (comThread.length === 0) {
    return null;
  }

  return (
    <>
      <section className="rounded-lg border bg-card">
        <header className="flex items-center justify-between border-b border-dashed bg-muted/30 px-4 py-2">
          <p className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
            <MessageSquare className="size-3" />
            Caixa de entrada
          </p>
          {totalNaoLidas > 0 ? (
            <span className="font-mono text-[10px] tracking-[0.06em] tabular-nums text-foreground">
              {String(totalNaoLidas).padStart(2, "0")} não lida
              {totalNaoLidas === 1 ? "" : "s"}
            </span>
          ) : null}
        </header>
        <ul className="divide-y">
          {comThread.map((f) => {
            const isNaoLida = f.mensagensNaoLidas > 0;
            const eu =
              f.ultimaMensagemAutor === "engenharia" ? "Você: " : "";
            return (
              <li
                key={f.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors",
                  isNaoLida
                    ? "bg-amber-50/40 hover:bg-amber-50/70 dark:bg-amber-950/10"
                    : "hover:bg-muted/30",
                )}
                onClick={() => setAberto({ id: f.id, nome: f.nome })}
              >
                {isNaoLida ? (
                  <span className="mt-2 inline-block size-2 shrink-0 rounded-full bg-amber-500" />
                ) : (
                  <span className="mt-2 inline-block size-2 shrink-0" />
                )}
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground font-bold text-background text-xs">
                  {iniciais(f.nome) || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        "truncate text-sm",
                        isNaoLida ? "font-semibold" : "font-medium",
                      )}
                    >
                      {f.nome}
                    </p>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {relTime(f.ultimaMensagemEm)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-0.5 line-clamp-2 text-[12px]",
                      isNaoLida ? "text-foreground/80" : "text-muted-foreground",
                    )}
                  >
                    {eu ? (
                      <span className="text-muted-foreground">{eu}</span>
                    ) : null}
                    {f.ultimaMensagemTexto}
                  </p>
                  {isNaoLida ? (
                    <p className="mt-1 font-mono text-[10px] tracking-[0.06em] tabular-nums text-amber-700 dark:text-amber-400">
                      {f.mensagensNaoLidas} não lida
                      {f.mensagensNaoLidas === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      {aberto ? (
        <ThreadDialog
          funcionarioId={aberto.id}
          funcionarioNome={aberto.nome}
          open={true}
          onOpenChange={(o) => {
            if (!o) setAberto(null);
          }}
        />
      ) : null}
    </>
  );
}
