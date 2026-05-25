"use client";

import { useState, useTransition } from "react";
import { Copy, HardHat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { formatDateTime, type DateFormat } from "@/lib/format";
import { isNextRedirectError } from "@/lib/next-errors";
import {
  createEscopoShareTokenAction,
  revokeEscopoShareTokenAction,
} from "./share-actions";

export type EscopoShareTokenView = {
  id: string;
  token: string;
  criadoEm: string;
};

type Props = {
  escopoId: string;
  baseUrl: string;
  tokens: EscopoShareTokenView[];
  dateFmt: DateFormat;
};

export function EscopoSharePanel({
  escopoId,
  baseUrl,
  tokens,
  dateFmt,
}: Props) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  const create = () => {
    setBusy(true);
    start(async () => {
      try {
        await createEscopoShareTokenAction(escopoId);
        toast.success("Link gerado");
      } catch (err) {
        if (isNextRedirectError(err)) {
          setBusy(false);
          throw err;
        }
        toast.error(err instanceof Error ? err.message : "Erro");
      } finally {
        setBusy(false);
      }
    });
  };

  const revoke = (tokenId: string) =>
    new Promise<void>((resolve) => {
      start(async () => {
        try {
          await revokeEscopoShareTokenAction(escopoId, tokenId);
          toast.success("Link revogado");
        } catch (err) {
          if (isNextRedirectError(err)) {
            resolve();
            throw err;
          }
          toast.error(err instanceof Error ? err.message : "Erro");
        } finally {
          resolve();
        }
      });
    });

  const copy = async (token: string) => {
    const url = `${baseUrl}/v/${token}/profissional`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Nao foi possivel copiar");
    }
  };

  if (tokens.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <HardHat className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Link do profissional</p>
            <p className="text-xs text-muted-foreground">
              Gere um link pro profissional marcar achados como resolvidos e
              anexar fotos. Fica ativo ate voce revogar.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={create}
          disabled={pending || busy}
        >
          <HardHat className="mr-1.5 size-4" />
          {busy ? "Gerando..." : "Gerar link"}
        </Button>
      </div>
    );
  }

  return (
    <section className="rounded-lg border bg-card">
      <header className="border-b border-dashed border-border bg-muted/30 px-4 py-2">
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
          <HardHat className="inline-block size-3 mr-1" />
          Links do profissional · {tokens.length} ativo
          {tokens.length === 1 ? "" : "s"}
        </p>
      </header>
      <div className="p-3 space-y-2">
        {tokens.map((t) => {
          const url = `${baseUrl}/v/${t.token}/profissional`;
          return (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-md border bg-muted/30 p-2"
            >
              <Input value={url} readOnly className="font-mono text-xs" />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => copy(t.token)}
                aria-label="Copiar link"
              >
                <Copy className="size-3.5" />
              </Button>
              <ConfirmDialog
                title="Revogar link?"
                description="Quem tem o link perde acesso imediatamente. As alteracoes ja feitas pelo profissional permanecem registradas."
                destructive
                confirmLabel="Revogar"
                onConfirm={() => revoke(t.id)}
                trigger={
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Revogar link"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                }
              />
              <span className="hidden sm:inline whitespace-nowrap text-xs text-muted-foreground">
                criado {formatDateTime(t.criadoEm, dateFmt)}
              </span>
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={create}
          disabled={pending || busy}
        >
          <HardHat className="mr-1.5 size-4" />
          {busy ? "Gerando..." : "Gerar novo link"}
        </Button>
      </div>
    </section>
  );
}
