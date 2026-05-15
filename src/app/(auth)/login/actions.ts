"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { login, passwordMatches } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({
  password: z.string().min(1),
  from: z.string().optional(),
});

export type LoginState = {
  error?: string;
};

const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

async function getClientKey(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `login:${ip}`;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const limit = await rateLimit({
    key: await getClientKey(),
    limit: LOGIN_MAX_ATTEMPTS,
    windowMs: LOGIN_WINDOW_MS,
  });
  if (!limit.allowed) {
    return {
      error: `Muitas tentativas. Tente novamente em ${limit.retryAfterSec}s.`,
    };
  }

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
