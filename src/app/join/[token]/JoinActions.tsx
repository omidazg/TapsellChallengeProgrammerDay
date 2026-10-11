"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui";
import { joinByInviteTokenAction } from "@/app/team/actions";

export function JoinButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function join() {
    setError(null);
    startTransition(async () => {
      const res = await joinByInviteTokenAction(token);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div>
      {error && (
        <div className="mb-3">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      <button type="button" onClick={join} disabled={pending} className="btn-primary w-full sm:w-auto">
        {pending ? "در حال پیوستن…" : "پیوستن به تیم"}
      </button>
    </div>
  );
}
