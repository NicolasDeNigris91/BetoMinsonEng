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
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <Image
        src="/logo-diminson.png"
        alt="DiMinson Engenharia"
        width={300}
        height={96}
        priority
        className="h-10 w-auto mb-8"
      />
      <AlertTriangle
        className="size-12 text-destructive"
        aria-hidden
      />
      <h1 className="mt-4 text-xl font-semibold">Algo deu errado</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Tente recarregar. Se persistir, anote o código abaixo e nos avise.
      </p>
      {error.digest ? (
        <code className="mt-3 rounded bg-muted px-2 py-1 font-mono text-xs">
          {error.digest}
        </code>
      ) : null}
      <Button onClick={reset} className="mt-6">
        Tentar de novo
      </Button>
    </div>
  );
}
