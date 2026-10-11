"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

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
      setMessage(
        `Sign-in needs an extra step that this form does not support (${signIn.status}).`,
      );
      return;
    }

    await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setMessage(
            `Account needs an extra step: ${session.currentTask.key}. Finish it in the Clerk dashboard.`,
          );
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

  const globalErrors = (errors.global ?? []).map(
    (error) => error.longMessage || error.message,
  );

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-t-4 border-t-brand bg-card p-6"
      >
        <div className="flex items-center gap-2">
          <BrandMark />
          <h1 className="text-xl font-semibold">Ecotrip CMS</h1>
        </div>

        <div className="space-y-1">
          <label htmlFor="username" className="text-sm font-medium">
            Username
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
              {errors.fields.identifier.longMessage ||
                errors.fields.identifier.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
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
              {errors.fields.password.longMessage ||
                errors.fields.password.message}
            </p>
          )}
        </div>

        {globalErrors.map((text, index) => (
          <p key={index} className="text-sm text-destructive">
            {text}
          </p>
        ))}
        {message && <p className="text-sm text-destructive">{message}</p>}

        <Button type="submit" className="w-full" disabled={submitting}>
          Login
        </Button>
      </form>
    </div>
  );
}
