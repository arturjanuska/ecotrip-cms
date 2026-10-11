"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";
import type { Message, Translate } from "@/lib/i18n/translate";

type ClerkError = { code?: string; message: string; longMessage?: string };

// Clerk's text, or ours for the codes we translate.
function clerkErrorText(t: Translate, error: ClerkError) {
  const key = `clerk.${error.code}`;
  const text = error.code ? t(key) : key;
  return text === key ? error.longMessage || error.message : text;
}

export function LoginForm() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const t = useT();

  const submitting = fetchStatus === "fetching";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const { error } = await signIn.password({
      identifier: username,
      password,
    });
    if (error) {
      return;
    }

    if (signIn.status !== "complete") {
      setMessage({
        key: "login.extraStep",
        params: { status: String(signIn.status) },
      });
      return;
    }

    await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setMessage({
            key: "login.taskStep",
            params: { task: session.currentTask.key },
          });
          return;
        }

        const url = decorateUrl("/postcodes");
        if (url.startsWith("http")) {
          window.location.href = url;
        } else {
          router.push(url);
        }
      },
    });
  }

  const globalErrors = (errors.global ?? []).map((error) =>
    clerkErrorText(t, error as ClerkError),
  );

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-t-4 border-t-brand bg-card p-6"
      >
        <div className="flex items-center gap-2">
          <BrandMark />
          <h1 className="mr-auto text-xl font-semibold">{t("app.name")}</h1>
          <LanguageSwitcher />
        </div>

        <div className="space-y-1">
          <label htmlFor="username" className="text-sm font-medium">
            {t("login.username")}
          </label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          {errors.fields.identifier && (
            <p className="text-sm text-destructive">
              {clerkErrorText(t, errors.fields.identifier)}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            {t("login.password")}
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {errors.fields.password && (
            <p className="text-sm text-destructive">
              {clerkErrorText(t, errors.fields.password)}
            </p>
          )}
        </div>

        {globalErrors.map((text, index) => (
          <p key={index} className="text-sm text-destructive">
            {text}
          </p>
        ))}
        {message && <p className="text-sm text-destructive">{t(message)}</p>}

        <Button type="submit" className="w-full" disabled={submitting}>
          {t("login.submit")}
        </Button>
      </form>
    </div>
  );
}
