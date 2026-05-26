"use client";

import { useState, useTransition } from "react";
import { HardHat, MessageSquarePlus, Send, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, type DateFormat } from "@/lib/format";
import { isNextRedirectError } from "@/lib/next-errors";
import { cn } from "@/lib/utils";

export type ComentarioView = {
  id: string;
  autor: "profissional" | "engenharia";
  texto: string;
  createdAt: Date;
};

type Props = {
  comentarios: ComentarioView[];
  meuPapel: "profissional" | "engenharia";
  /** Nome a exibir do profissional (vem do nome do escopo). */
  profissionalNome: string;
  /** Nome a exibir da engenharia. Hoje sempre "Roberto Minson". */
  engenhariaNome: string;
  /** Callback que dispara a server action. Devolve ActionError ou void. */
  onSubmit: (texto: string) => Promise<{ error?: string } | void>;
  dateFmt: DateFormat;
};

export function ThreadComentarios({
  comentarios,
  meuPapel,
  profissionalNome,
  engenhariaNome,
  onSubmit,
  dateFmt,
}: Props) {
  const [texto, setTexto] = useState("");
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState(comentarios.length === 0);

  const ultimo = comentarios[comentarios.length - 1];
  // Acao necessaria quando a ultima mensagem foi da outra parte. Mostra
  // chip no card pra deixar claro pra quem ta a bola.
  const acaoNecessaria = ultimo != null && ultimo.autor !== meuPapel;

  const submit = () => {
    const trimmed = texto.trim();
    if (trimmed.length === 0) return;
    start(async () => {
      try {
        const result = await onSubmit(trimmed);
        if (result && "error" in result && result.error) {
          toast.error(result.error);
          return;
        }
        setTexto("");
        setExpanded(false);
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error("Erro ao enviar mensagem. Tente novamente.");
      }
    });
  };

  const headerLabel =
    comentarios.length === 0
      ? "Conversa"
      : `Conversa · ${comentarios.length} ${
          comentarios.length === 1 ? "mensagem" : "mensagens"
        }`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
          {headerLabel}
        </p>
        {acaoNecessaria ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-[9px] tracking-[0.08em] uppercase text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-300">
            aguardando sua resposta
          </span>
        ) : null}
      </div>

      {comentarios.length > 0 ? (
        <ul className="space-y-2">
          {comentarios.map((c) => {
            const isMine = c.autor === meuPapel;
            const autorNome =
              c.autor === "engenharia" ? engenhariaNome : profissionalNome;
            const Icon = c.autor === "engenharia" ? HardHat : User;
            return (
              <li
                key={c.id}
                className={cn(
                  "rounded-md border bg-card px-3 py-2 text-sm",
                  c.autor === "engenharia"
                    ? "border-l-2 border-l-brand"
                    : "border-l-2 border-l-amber-400",
                  isMine ? "bg-muted/40" : "",
                )}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Icon
                    className={cn(
                      "size-3",
                      c.autor === "engenharia"
                        ? "text-brand"
                        : "text-amber-700 dark:text-amber-300",
                    )}
                    aria-hidden
                  />
                  <span className="font-mono text-[10px] tracking-[0.06em] font-semibold text-foreground/80">
                    {autorNome}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {formatDateTime(c.createdAt, dateFmt)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line text-foreground/90">
                  {c.texto}
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}

      {expanded ? (
        <div className="space-y-2">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            placeholder={
              meuPapel === "engenharia"
                ? "Escreva uma resposta ao profissional..."
                : "Escreva uma mensagem para a engenharia..."
            }
            disabled={pending}
            maxLength={2000}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={pending || texto.trim().length === 0}
            >
              <Send className="mr-1.5 size-4" />
              {pending ? "Enviando..." : "Enviar"}
            </Button>
            {comentarios.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTexto("");
                  setExpanded(false);
                }}
                disabled={pending}
              >
                Cancelar
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setExpanded(true)}
        >
          <MessageSquarePlus className="mr-1.5 size-4" />
          {meuPapel === "engenharia"
            ? "Responder ao profissional"
            : "Responder à engenharia"}
        </Button>
      )}
    </div>
  );
}
