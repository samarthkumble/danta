"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./client";

/** Builds a fresh copy of the demo case (Priya's quote) and opens the patient's view. */
export function StartDemo({ label = "Open the live demo", to = "patient" }: { label?: string; to?: "patient" | "clinic" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack">
      <button
        className="btn btn-gold"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await api<{ id: string; token: string }>("/api/demo/reset", {});
            router.push(to === "patient" ? `/p/${r.token}` : `/clinic/${r.id}`);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setBusy(false);
          }
        }}
      >
        {busy ? "Reading the clinic's quote…" : label}
      </button>
      {busy && <p className="small muted">The AI reads the quote and code checks every number. This takes about 10 seconds.</p>}
      {error && <p className="note warn" role="alert">Could not start the demo: {error}</p>}
    </div>
  );
}
