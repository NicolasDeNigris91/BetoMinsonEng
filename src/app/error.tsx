"use client";

import { useEffect } from "react";
import Image from "next/image";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] uncaught error", error);
  }, [error]);

  return (
    <div className="bp-grid-strong relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-6 text-center">
      <span className="absolute top-4 right-4 rounded-sm border border-border bg-card px-1.5 py-0.5 font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
        ERR · {new Date().getFullYear()}
      </span>

      <Image
        src="/logo-diminson.png"
        alt="DiMinson Engenharia"
        width={300}
        height={96}
        priority
        className="mb-7 h-9 w-auto"
      />
      <div className="rounded-lg border border-dashed border-destructive/40 p-3">
        <AlertTriangle className="size-10 text-destructive" aria-hidden />
      </div>
      <p className="mt-4 font-mono text-[10px] tracking-[0.18em] uppercase text-destructive">
        Erro inesperado
      </p>
      <h1 className="mt-1 text-[22px] font-extrabold leading-tight tracking-[-0.015em]">
        Algo deu errado
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Tente recarregar. Se persistir, anote o código abaixo e nos avise.
      </p>
      {error.digest ? (
        <code className="mt-3 rounded-sm border border-border bg-card px-2 py-1 font-mono text-xs tracking-wide">
          {error.digest}
        </code>
      ) : null}
      <Button onClick={reset} className="mt-6">
        Tentar de novo
      </Button>
    </div>
  );
}
