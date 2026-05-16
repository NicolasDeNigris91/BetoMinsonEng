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
      <div className="w-full max-w-sm">
        <div className="border border-border border-t-2 border-t-foreground bg-card px-8 py-10">
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
              Vistorias técnicas
            </p>
          </div>

          <LoginForm from={from} />

          <p className="mt-6 text-center font-mono text-[9px] tracking-[0.18em] text-muted-foreground/70 uppercase">
            Uso interno
          </p>
        </div>
      </div>
    </div>
  );
}
