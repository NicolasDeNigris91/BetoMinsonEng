"use client";

import { useTransition } from "react";
import { Copy, HardHat, Power, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { isNextRedirectError } from "@/lib/next-errors";
import {
  deactivateFuncionarioAction,
  reactivateFuncionarioAction,
  regenerateTokenAction,
} from "../actions";

type Props = {
  funcionarioId: string;
  baseUrl: string;
  token: string;
  desativado: boolean;
};

export function FuncionarioSharePanel({
  funcionarioId,
  baseUrl,
  token,
  desativado,
}: Props) {
  const [pending, start] = useTransition();
  const url = `${baseUrl}/f/${token}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const regenerate = () =>
    new Promise<void>((resolve) => {
      start(async () => {
        try {
          await regenerateTokenAction(funcionarioId);
          toast.success("Link regenerado");
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

  const toggle = () =>
    new Promise<void>((resolve) => {
      start(async () => {
        try {
          if (desativado) {
            await reactivateFuncionarioAction(funcionarioId);
            toast.success("Funcionário reativado");
          } else {
            await deactivateFuncionarioAction(funcionarioId);
            toast.success("Funcionário desativado");
          }
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

  return (
    <section className="rounded-lg border bg-card">
      <header className="border-b border-dashed border-border bg-muted/30 px-4 py-2">
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
          <HardHat className="inline-block size-3 mr-1" />
          Link do funcionário
          {desativado ? (
            <span className="ml-2 rounded-full border border-destructive/50 bg-destructive/10 px-2 py-[1px] text-[10px] uppercase tracking-[0.08em] text-destructive">
              desativado
            </span>
          ) : null}
        </p>
      </header>
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
          <Input value={url} readOnly className="font-mono text-xs" />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={copy}
            aria-label="Copiar link"
          >
            <Copy className="size-3.5" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <ConfirmDialog
            title="Regerar link?"
            description="Quem tem o link atual perde acesso imediatamente. Um novo link é gerado e precisa ser enviado de novo."
            destructive
            confirmLabel="Regerar"
            onConfirm={regenerate}
            trigger={
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
              >
                <RefreshCw className="mr-1.5 size-3.5" />
                Regerar link
              </Button>
            }
          />
          <ConfirmDialog
            title={desativado ? "Reativar funcionário?" : "Desativar funcionário?"}
            description={
              desativado
                ? "O link volta a funcionar e o funcionário pode acessar de novo."
                : "O link para de funcionar imediatamente. As alterações já feitas pelo funcionário permanecem registradas."
            }
            destructive={!desativado}
            confirmLabel={desativado ? "Reativar" : "Desativar"}
            onConfirm={toggle}
            trigger={
              <Button
                type="button"
                size="sm"
                variant={desativado ? "default" : "ghost"}
                disabled={pending}
              >
                <Power className="mr-1.5 size-3.5" />
                {desativado ? "Reativar" : "Desativar"}
              </Button>
            }
          />
        </div>
      </div>
    </section>
  );
}
