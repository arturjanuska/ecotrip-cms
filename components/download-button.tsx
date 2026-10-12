"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ApiError,
  loadProblem,
  problemText,
  type Problem,
} from "@/lib/api-errors";
import { useT } from "@/lib/i18n/client";

// "attachment; filename="postcodes-2026-10-12.csv"" → the file name.
function fileName(disposition: string | null, fallback: string) {
  return disposition?.match(/filename="?([^";]+)"?/)?.[1] ?? fallback;
}

/**
 * Downloads the file `href` answers with. Unlike a plain link it knows when
 * the download is done, so it shows a spinner until then, and an error if the
 * request fails.
 */
export function DownloadButton({
  href,
  fallbackName,
  children,
}: {
  href: string;
  fallbackName: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const download = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) {
        throw new ApiError(
          response.status,
          await response.json().catch(() => null),
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName(
        response.headers.get("Content-Disposition"),
        fallbackName,
      );
      link.click();
      // Later: some browsers still read the URL after click() returns.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      setProblem(loadProblem(error, "errors.requestFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" disabled={busy} onClick={download}>
        {busy && <Spinner />}
        {children}
      </Button>
      {problem && (
        <p className="basis-full text-right text-sm text-destructive">
          {problemText(t, problem)}
        </p>
      )}
    </>
  );
}
