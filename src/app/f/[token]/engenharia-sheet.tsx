"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CATEGORIA_BADGE_CLASS } from "@/lib/category-styles";
import { CATEGORIA_LABELS } from "@/db/schema";
import { isNextRedirectError } from "@/lib/next-errors";
import {
  enviarMensagemFuncionarioAction,
  marcarMensagensLidasFuncionarioAction,
} from "@/app/(app)/funcionarios/mensagens-actions";
import {
  fetchThreadByTokenAction,
  type ThreadMessage,
} from "./thread-loader";
import { useEngenharia } from "./engenharia-context";

type Props = {
  token: string;
  naoLidasIniciais: number;
};

export function EngenhariaSheet({ token, naoLidasIniciais }: Props) {
  const router = useRouter();
  const { open, achadoRef, openSheetWith, closeSheet, clearAchadoRef } =
    useEngenharia();
  const [mensagens, setMensagens] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [texto, setTexto] = useState("");
  const [sending, startSend] = useTransition();
  const [naoLidasLocal, setNaoLidasLocal] = useState(naoLidasIniciais);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    queueMicrotask(() => setNaoLidasLocal(naoLidasIniciais));
  }, [naoLidasIniciais]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const result = await fetchThreadByTokenAction(token);
        if (cancelled) return;
        if ("error" in result) {
          toast.error(result.error);
          closeSheet();
          return;
        }
        setMensagens(result.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    void marcarMensagensLidasFuncionarioAction(token).then(() => {
      setNaoLidasLocal(0);
      router.refresh();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [mensagens]);

  const enviar = () => {
    const trimmed = texto.trim();
    if (!trimmed) return;
    const refId = achadoRef?.id;
    startSend(async () => {
      try {
        const result = await enviarMensagemFuncionarioAction(
          token,
          trimmed,
          refId,
        );
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        setTexto("");
        clearAchadoRef();
        const re = await fetchThreadByTokenAction(token);
        if (!("error" in re)) setMensagens(re.data);
        router.refresh();
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error("Erro ao enviar. Tente novamente.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => openSheetWith(null)}
        className="relative inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MessageCircle className="size-3.5" />
        Engenharia
        {naoLidasLocal > 0 ? (
          <span className="absolute -top-1 -right-1 rounded-full bg-primary px-1.5 py-0.5 font-mono text-[9px] font-bold leading-none tabular-nums text-primary-foreground">
            {naoLidasLocal > 9 ? "9+" : naoLidasLocal}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeSheet}
          />
          <div className="relative flex w-full max-w-md flex-col rounded-t-2xl border-t-2 border-t-foreground bg-background shadow-xl sm:max-h-[80vh] sm:rounded-2xl">
            <header className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm">Engenharia</p>
                <p className="text-[10px] text-muted-foreground">
                  Roberto Minson · responde quando puder
                </p>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </header>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto bg-muted/20 p-3 space-y-2"
              style={{ minHeight: 280, maxHeight: 420 }}
            >
              {loading ? (
                <p className="text-center text-[11px] text-muted-foreground py-8">
                  Carregando…
                </p>
              ) : mensagens.length === 0 ? (
                <p className="text-center text-[11px] text-muted-foreground py-8">
                  Nenhuma mensagem ainda. Mande a primeira pra engenharia.
                </p>
              ) : (
                mensagens.map((m, i) => {
                  const isMe = m.autor === "funcionario";
                  const prev = i > 0 ? mensagens[i - 1] : null;
                  const showDate =
                    !prev ||
                    new Date(m.criadoEm).toDateString() !==
                      new Date(prev.criadoEm).toDateString();
                  return (
                    <div key={m.id} className="space-y-2">
                      {showDate ? (
                        <p className="text-center font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground py-1">
                          — {formatDate(m.criadoEm)} —
                        </p>
                      ) : null}
                      <div
                        className={cn(
                          "flex",
                          isMe ? "justify-end" : "justify-start",
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[80%] rounded-2xl px-3 py-2",
                            isMe
                              ? "bg-foreground text-background rounded-br-sm"
                              : "border border-amber-200 bg-amber-50 rounded-bl-sm dark:border-amber-900 dark:bg-amber-950/30",
                          )}
                        >
                          {!isMe ? (
                            <p className="mb-1 font-mono text-[9px] tracking-[0.14em] uppercase text-amber-700 dark:text-amber-400">
                              Engenharia
                            </p>
                          ) : null}
                          {m.achadoRef ? (
                            <div
                              className={cn(
                                "mb-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5",
                                isMe
                                  ? "border-background/30 bg-background/10"
                                  : "border-amber-300 bg-white/60 dark:border-amber-800 dark:bg-amber-950/50",
                              )}
                            >
                              <Badge
                                variant="outline"
                                className={cn(
                                  "shrink-0 font-mono text-[9px]",
                                  CATEGORIA_BADGE_CLASS[m.achadoRef.categoria],
                                )}
                              >
                                {m.achadoRef.categoria}
                              </Badge>
                              <span
                                className={cn(
                                  "truncate text-[11px]",
                                  isMe ? "text-background" : "text-foreground",
                                )}
                                title={`${m.achadoRef.empreendimentoNome} · ${m.achadoRef.unidadeNome}${m.achadoRef.local ? " · " + m.achadoRef.local : ""}`}
                              >
                                {m.achadoRef.local ?? m.achadoRef.unidadeNome}
                              </span>
                            </div>
                          ) : null}
                          <p className="text-sm whitespace-pre-wrap">
                            {m.texto}
                          </p>
                          <p
                            className={cn(
                              "mt-1 text-[10px]",
                              isMe
                                ? "text-background/60"
                                : "text-muted-foreground",
                            )}
                          >
                            {formatTime(m.criadoEm)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Chip do achado anexado ao envio (locked) */}
            {achadoRef ? (
              <div className="mx-3 mt-2 inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5">
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 font-mono text-[9px]",
                    CATEGORIA_BADGE_CLASS[achadoRef.categoria],
                  )}
                >
                  {CATEGORIA_LABELS[achadoRef.categoria]}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-[11px]">
                  Falando sobre:{" "}
                  <strong>{achadoRef.local ?? achadoRef.descricao.slice(0, 40)}</strong>
                </span>
                <button
                  type="button"
                  onClick={clearAchadoRef}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Remover referência ao achado"
                >
                  <X className="size-3" />
                </button>
              </div>
            ) : null}

            <footer className="flex items-center gap-2 border-t bg-background p-3">
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                  }
                }}
                placeholder="Escrever…"
                rows={1}
                disabled={sending}
                className="flex-1 resize-none rounded-full border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
              <button
                type="button"
                onClick={enviar}
                disabled={sending || texto.trim().length === 0}
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-foreground p-2.5 text-background hover:brightness-110 disabled:opacity-50"
                aria-label="Enviar"
              >
                <Send className="size-4" />
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR");
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
