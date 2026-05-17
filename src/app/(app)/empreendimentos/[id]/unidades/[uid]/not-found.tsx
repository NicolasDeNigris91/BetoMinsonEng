import Link from "next/link";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UnidadeNotFound() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3">
        <Home className="size-10 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-4 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
        Unidade inexistente
      </p>
      <h1 className="mt-1 text-[22px] font-extrabold leading-tight tracking-[-0.015em]">
        Unidade não encontrada
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Pode ter sido excluída ou o link está incorreto.
      </p>
      <Button className="mt-6" render={<Link href="/empreendimentos" />}>
        Ver empreendimentos
      </Button>
    </div>
  );
}
