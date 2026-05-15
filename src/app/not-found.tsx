import Image from "next/image";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="bp-grid-strong relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-6 text-center">
      <span className="absolute top-4 right-4 rounded-sm border border-border bg-card px-1.5 py-0.5 font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
        404 · {new Date().getFullYear()}
      </span>

      <Image
        src="/logo-diminson.png"
        alt="DiMinson Engenharia"
        width={300}
        height={96}
        priority
        className="mb-7 h-9 w-auto"
      />
      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3">
        <FileQuestion className="size-10 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-4 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
        Rota inexistente
      </p>
      <h1 className="mt-1 text-[22px] font-extrabold leading-tight tracking-[-0.015em]">
        Página não encontrada
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        O endereço acessado não existe ou o item foi removido.
      </p>
      <Button className="mt-6" render={<Link href="/empreendimentos" />}>
        Voltar para empreendimentos
      </Button>
    </div>
  );
}
