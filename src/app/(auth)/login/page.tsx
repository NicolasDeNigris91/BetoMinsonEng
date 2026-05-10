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
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">RME</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sistema interno de vistorias
          </p>
        </div>
        <LoginForm from={from} />
      </div>
    </div>
  );
}
