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
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="font-semibold tracking-tight">
            RME · Vistorias
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
