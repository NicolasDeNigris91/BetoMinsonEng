"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Paperclip, Send, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CATEGORIA_BADGE_CLASS } from "@/lib/category-styles";
import { isNextRedirectError } from "@/lib/next-errors";
import {
  enviarMensagemAdminAction,
  marcarMensagensLidasAdminAction,
} from "./mensagens-actions";
import {
  fetchAchadosDoFuncionarioAction,
  fetchThreadAction,
  type AchadoOption,
  type ThreadMessage,
} from "./thread-loader";

type Props = {
  funcionarioId: string;
  funcionarioNome: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ThreadDialog({
  funcionarioId,
  funcionarioNome,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [mensagens, setMensagens] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [texto, setTexto] = useState("");
  const [sending, startSend] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [achadoRef, setAchadoRef] = useState<AchadoOption | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [opcoes, setOpcoes] = useState<AchadoOption[] | null>(null);
  const [opcoesLoading, setOpcoesLoading] = useState(false);

  const abrirPicker = () => {
    setPickerOpen(true);
    if (opcoes !== null) return;
    setOpcoesLoading(true);
    void fetchAchadosDoFuncionarioAction(funcionarioId)
      .then((r) => {
        if ("error" in r) {
          toast.error(r.error);
          setOpcoes([]);
          return;
        }
        setOpcoes(r.data);
      })
      .finally(() => setOpcoesLoading(false));
  };

  // Deps restritas a [open, funcionarioId]: CaixaDeEntrada passa
  // onOpenChange como lambda inline. Incluir em deps disparava loop
  // action -> router.refresh -> parent re-render -> ref nova = piscar.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const result = await fetchThreadAction(funcionarioId);
        if (cancelled) return;
        if ("error" in result) {
          toast.error(result.error);
          onOpenChange(false);
          return;
        }
        setMensagens(result.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    void marcarMensagensLidasAdminAction(funcionarioId).then(() => {
      router.refresh();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, funcionarioId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [mensagens]);

  const enviar = () => {
    const trimmed = texto.trim();
    if (!trimmed) return;
    startSend(async () => {
      try {
        const result = await enviarMensagemAdminAction(
          funcionarioId,
          trimmed,
          achadoRef?.id,
        );
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        setTexto("");
        setAchadoRef(null);
        const re = await fetchThreadAction(funcionarioId);
        if (!("error" in re)) setMensagens(re.data);
        router.refresh();
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error("Erro ao enviar. Tente novamente.");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setAchadoRef(null);
          setPickerOpen(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex h-[70vh] max-h-[600px] w-[95vw] flex-col rounded-none border-t-2 border-t-foreground sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            Conversa com funcionário
          </DialogTitle>
          <DialogDescription className="-mt-1 text-[18px] font-extrabold leading-tight tracking-[-0.01em] text-foreground">
            {funcionarioNome}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto rounded-md border bg-muted/30 p-3 space-y-2"
        >
          {loading ? (
            <p className="text-center text-[11px] text-muted-foreground py-8">
              Carregando…
            </p>
          ) : mensagens.length === 0 ? (
            <p className="text-center text-[11px] text-muted-foreground py-8">
              Nenhuma mensagem ainda. Mande a primeira.
            </p>
          ) : (
            mensagens.map((m, i) => {
              const isMe = m.autor === "engenharia";
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
                          : "bg-card border rounded-bl-sm",
                      )}
                    >
                      {m.achadoRef ? (
                        <Link
                          href={`/empreendimentos/${m.achadoRef.empreendimentoId}/unidades/${m.achadoRef.unidadeId}`}
                          className={cn(
                            "mb-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 transition-colors hover:bg-muted/40",
                            isMe
                              ? "border-background/30 bg-background/10 hover:bg-background/20"
                              : "border-border",
                          )}
                          title={`${m.achadoRef.empreendimentoNome} · ${m.achadoRef.unidadeNome}${m.achadoRef.local ? " · " + m.achadoRef.local : ""}`}
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
                          >
                            {m.achadoRef.local ?? m.achadoRef.unidadeNome}
                          </span>
                        </Link>
                      ) : null}
                      <p className="text-sm whitespace-pre-wrap">{m.texto}</p>
                      <p
                        className={cn(
                          "mt-1 text-[10px]",
                          isMe ? "text-background/60" : "text-muted-foreground",
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

        {achadoRef ? (
          <div className="flex items-center gap-2 rounded-md border border-sky-500/40 border-l-2 border-l-sky-500 bg-sky-500/[0.06] px-2 py-1.5">
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 font-mono text-[9px]",
                CATEGORIA_BADGE_CLASS[achadoRef.categoria],
              )}
            >
              {achadoRef.categoria}
            </Badge>
            <div className="min-w-0 flex-1 text-[11px] leading-tight">
              <p className="truncate font-semibold text-foreground">
                {achadoRef.local ?? achadoRef.descricao}
              </p>
              <p className="truncate font-mono text-[9px] tracking-[0.06em] uppercase text-muted-foreground">
                {achadoRef.empreendimentoNome} · {achadoRef.unidadeNome}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAchadoRef(null)}
              className="rounded p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground"
              aria-label="Remover anexo"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}

        <div className="relative flex items-center gap-2">
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => (pickerOpen ? setPickerOpen(false) : abrirPicker())}
              className={cn(
                "shrink-0",
                achadoRef && "border-sky-500/60 text-sky-600 dark:text-sky-400",
              )}
              title={achadoRef ? "Trocar achado" : "Anexar achado"}
            >
              <Paperclip className="size-4" />
            </Button>
            {pickerOpen ? (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setPickerOpen(false)}
                />
                <div className="absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-md border bg-popover shadow-lg">
                  <div className="border-b px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.12em] uppercase text-muted-foreground">
                    Achados de {funcionarioNome.split(" ")[0]}
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {opcoesLoading ? (
                      <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                        Carregando…
                      </p>
                    ) : !opcoes || opcoes.length === 0 ? (
                      <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                        Nenhum achado em aberto.
                      </p>
                    ) : (
                      opcoes.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => {
                            setAchadoRef(o);
                            setPickerOpen(false);
                          }}
                          className="flex w-full items-start gap-2 border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-muted/60"
                        >
                          <Badge
                            variant="outline"
                            className={cn(
                              "mt-0.5 shrink-0 font-mono text-[9px]",
                              CATEGORIA_BADGE_CLASS[o.categoria],
                            )}
                          >
                            {o.categoria}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] text-foreground">
                              {o.local ?? o.descricao}
                            </p>
                            <p className="truncate font-mono text-[9px] tracking-[0.06em] uppercase text-muted-foreground">
                              {o.empreendimentoNome} · {o.unidadeNome}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            placeholder="Escrever mensagem… (Enter envia, Shift+Enter quebra linha)"
            rows={2}
            disabled={sending}
            enterKeyHint="send"
            className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <Button
            type="button"
            onClick={enviar}
            disabled={sending || texto.trim().length === 0}
            size="default"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
