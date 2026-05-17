"use client";

import { useState, useTransition } from "react";
import { Copy, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { formatDateTime, type DateFormat } from "@/lib/format";
import { isNextRedirectError } from "@/lib/next-errors";
import {
  createShareTokenAction,
  revokeShareTokenAction,
} from "./share-actions";

type ShareTokenView = {
  id: string;
  token: string;
  expiraEm: string;
  criadoEm: string;
};

type Props = {
  vistoriaId: string;
  baseUrl: string;
  tokens: ShareTokenView[];
  dateFmt: DateFormat;
};

export function SharePanel({ vistoriaId, baseUrl, tokens, dateFmt }: Props) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  const create = () => {
    setBusy(true);
    start(async () => {
      try {
        await createShareTokenAction(vistoriaId);
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
          await revokeShareTokenAction(vistoriaId, tokenId);
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
    const url = `${baseUrl}/v/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  // Vazio: linha compacta no rodape; expande pro Card quando tem token ativo.
  if (tokens.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Link2 className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Compartilhar com cliente</p>
            <p className="text-xs text-muted-foreground">
              Gere um link de 7 dias quando estiver pronto pra enviar.
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
          <Link2 className="mr-1.5 size-4" />
          {busy ? "Gerando..." : "Gerar link"}
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-4" />
          Compartilhar com cliente
        </CardTitle>
        <CardDescription>
          Cada link permite visualizar esta vistoria sem login durante 7 dias.
          Você pode revogar a qualquer momento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {tokens.map((t) => {
            const url = `${baseUrl}/v/${t.token}`;
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
                  description="Quem tem o link perde acesso imediatamente."
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
                <span className="text-xs text-muted-foreground hidden sm:inline whitespace-nowrap">
                  expira {formatDateTime(t.expiraEm, dateFmt)}
                </span>
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          size="sm"
          onClick={create}
          disabled={pending || busy}
        >
          <Link2 className="mr-1.5 size-4" />
          {busy ? "Gerando..." : "Gerar novo link"}
        </Button>
      </CardContent>
    </Card>
  );
}
