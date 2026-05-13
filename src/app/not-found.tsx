import Image from "next/image";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
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
      <FileQuestion className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold">Página não encontrada</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        O endereço acessado não existe ou o item foi removido.
      </p>
      <Button
        className="mt-6"
        render={<Link href="/empreendimentos" />}
      >
        Voltar para empreendimentos
      </Button>
    </div>
  );
}
