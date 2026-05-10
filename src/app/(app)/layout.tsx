import Image from "next/image";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo-diminson.png"
              alt="DiMinson Engenharia"
              width={300}
              height={96}
              priority
              className="h-9 w-auto"
            />
            <span className="sr-only">DiMinson Engenharia — Vistorias</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/empreendimentos"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Empreendimentos
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
      </main>
    </div>
  );
}
