import Image from "next/image";
import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { LoginForm } from "./login-form";

type SearchParams = Promise<{ from?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (await isLoggedIn()) {
    redirect("/");
  }

  const params = await searchParams;
  const from = params.from ?? "/";

  return (
    <div className="bp-grid-strong relative flex min-h-dvh items-center justify-center overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-3 truncate text-center font-mono text-[10px] tracking-[0.4em] text-foreground/15 uppercase"
      >
        diminson · eng · diminson · eng · diminson · eng · diminson · eng
      </div>

      <div className="relative w-full max-w-sm">
        <div
          aria-hidden
          className="absolute top-0 -left-0.5 bottom-0 w-1 rounded-l-xl bg-brand"
        />
        <div className="rounded-xl border border-border bg-card px-8 py-10 shadow-[0_8px_30px_rgba(15,30,58,0.08)]">
          <span className="absolute top-4 right-4 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
            VST · {new Date().getFullYear()}
          </span>

          <div className="mb-7 flex flex-col items-center text-center">
            <Image
              src="/logo-diminson.png"
              alt="DiMinson Engenharia"
              width={300}
              height={96}
              priority
              className="h-auto w-56"
            />
            <p className="mt-3 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Vistorias · Inspeções técnicas
            </p>
          </div>

          <LoginForm from={from} />

          <p className="mt-6 text-center font-mono text-[9px] tracking-[0.18em] text-muted-foreground/70 uppercase">
            DiMinson Engenharia · uso interno
          </p>
        </div>
      </div>
    </div>
  );
}
