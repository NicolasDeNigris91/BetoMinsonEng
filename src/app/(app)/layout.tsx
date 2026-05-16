import Image from "next/image";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getDateFormat } from "@/lib/date-format-server";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutPanel } from "@/components/shortcut-panel";
import { DateFormatToggle } from "./date-format-toggle";
import { LogoutButton } from "./logout-button";
import { SearchTrigger } from "./search-trigger";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  const dateFormat = await getDateFormat();

  return (
    <div className="bp-grid flex min-h-screen flex-col">
      <header className="relative border-b bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo-diminson.png"
              alt="DiMinson Engenharia"
              width={300}
              height={96}
              priority
              className="h-9 w-auto"
            />
            <span className="hidden font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground sm:inline">
              Vistorias · Inspeções técnicas
            </span>
            <span className="sr-only">DiMinson Engenharia — Vistorias</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <SearchTrigger />
            <Link
              href="/empreendimentos"
              className="text-muted-foreground hover:text-brand transition-colors"
            >
              Empreendimentos
            </Link>
            <DateFormatToggle current={dateFormat} />
            <LogoutButton />
          </nav>
        </div>
        <div
          className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent opacity-60"
          aria-hidden
        />
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
      </main>
      <CommandPalette />
      <ShortcutPanel />
    </div>
  );
}
