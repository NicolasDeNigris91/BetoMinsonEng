"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Copy, RefreshCcw, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatDateTimeBR } from "@/lib/format";
import {
  createUploadTokenAction,
  revokeUploadTokenAction,
} from "./upload-token-actions";

type Props = {
  vistoriaId: string;
  baseUrl: string;
  activeToken: { token: string; expiraEm: string } | null;
};

export function MobileUploadButton({ vistoriaId, baseUrl, activeToken }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const url = activeToken ? `${baseUrl}/v/${activeToken.token}/celular` : null;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // refresh on close to pick up photos uploaded from the phone
      router.refresh();
    }
  };

  const handleCreate = () => {
    start(async () => {
      try {
        await createUploadTokenAction(vistoriaId);
        toast.success("Link gerado");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao gerar link");
      }
    });
  };

  const handleRevoke = () =>
    new Promise<void>((resolve) => {
      start(async () => {
        try {
          await revokeUploadTokenAction(vistoriaId);
          toast.success("Link revogado");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Erro");
        } finally {
          resolve();
        }
      });
    });

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline">
            <Smartphone className="mr-1.5 size-4" />
            Modo celular
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modo celular</DialogTitle>
          <DialogDescription>
            Escaneie o QR com a câmera do celular para abrir uma página de
            upload direto desta vistoria. Sem login, válido por 24h.
          </DialogDescription>
        </DialogHeader>

        {!activeToken || !url ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Nenhum link de upload ativo para esta vistoria.
            </p>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={pending}
              className="w-full"
            >
              {pending ? "Gerando..." : "Gerar link"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center rounded-lg border bg-white p-4">
              <QRCodeSVG value={url} size={208} level="M" includeMargin={false} />
            </div>

            <div className="flex items-center gap-2">
              <Input value={url} readOnly className="font-mono text-xs" />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCopy}
                aria-label="Copiar link"
              >
                <Copy className="size-3.5" />
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Expira em {formatDateTimeBR(activeToken.expiraEm)}.
            </p>

            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  router.refresh();
                  toast.success("Atualizado");
                }}
              >
                <RefreshCcw className="mr-1.5 size-3.5" />
                Atualizar página
              </Button>
              <ConfirmDialog
                title="Revogar link?"
                description="Quem tiver o link perde acesso imediatamente."
                destructive
                confirmLabel="Revogar"
                onConfirm={handleRevoke}
                trigger={
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                  >
                    <Trash2 className="mr-1.5 size-3.5" />
                    Revogar
                  </Button>
                }
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
