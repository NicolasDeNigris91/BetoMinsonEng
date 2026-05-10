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
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/logo-diminson.png"
            alt="DiMinson Engenharia"
            width={300}
            height={96}
            priority
            className="h-auto w-64"
          />
          <p className="text-sm text-muted-foreground mt-2">
            Sistema de vistorias
          </p>
        </div>
        <LoginForm from={from} />
      </div>
    </div>
  );
}
