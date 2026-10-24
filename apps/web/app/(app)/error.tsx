"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { reportClientError } from "@/lib/errors/reportClientError";

/** Shown when a page under (app) throws while rendering. The (app) layout supplies the language, so useT works here. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => { reportClientError(error); }, [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-start gap-3 p-8">
      <h1 className="text-lg font-semibold">{t("app_error_title")}</h1>
      <Button variant="ghost" onClick={reset}>{t("app_error_retry")}</Button>
    </div>
  );
}
