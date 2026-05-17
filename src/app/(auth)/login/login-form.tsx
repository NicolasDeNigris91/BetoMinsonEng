"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ from }: { from: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  // Detecta Caps Lock pelo evento (mais confiavel que tentar adivinhar
  // por timing). KeyboardEvent.getModifierState e suportado em todos os
  // navegadores modernos.
  function trackCapsLock(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState("CapsLock"));
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="from" value={from} />
      {/* Username escondido (mas presente no DOM) pra que gerenciadores de
          senha do navegador — 1Password, Bitwarden, Chrome — consigam
          salvar e auto-preencher o login. */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        value="diminson"
        readOnly
        hidden
      />
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            autoFocus
            required
            disabled={pending}
            onKeyDown={trackCapsLock}
            onKeyUp={trackCapsLock}
            onBlur={() => setCapsLock(false)}
            className="pr-9 font-mono tracking-widest"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={pending}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex items-center justify-center px-2 text-muted-foreground transition hover:text-foreground focus-visible:text-foreground focus-visible:outline-none disabled:opacity-50"
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </div>
        {capsLock ? (
          <p
            role="status"
            aria-live="polite"
            className="font-mono text-[10px] tracking-[0.18em] text-amber-700 uppercase dark:text-amber-300"
          >
            ⚠ Caps Lock ativado
          </p>
        ) : null}
      </div>

      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
