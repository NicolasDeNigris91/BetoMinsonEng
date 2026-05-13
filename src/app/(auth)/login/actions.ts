"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login, passwordMatches } from "@/lib/auth";

const loginSchema = z.object({
  password: z.string().min(1),
  from: z.string().optional(),
});

export type LoginState = {
  error?: string;
};

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    password: formData.get("password"),
    from: formData.get("from"),
  });

  if (!parsed.success) {
    return { error: "Senha inválida." };
  }

  if (!passwordMatches(parsed.data.password)) {
    return { error: "Senha incorreta." };
  }

  await login();

  const raw = parsed.data.from ?? "";
  const isSafeInternalPath =
    raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\");
  redirect(isSafeInternalPath ? raw : "/");
}
