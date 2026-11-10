"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./client";

const LANGS = ["English", "Hindi", "Kannada", "Malayalam", "Tamil", "Telugu", "Gujarati", "Punjabi", "Bengali", "Marathi", "Arabic"];

/** Paste any clinic quote and get a checked, staged payment plan. */
export function QuoteForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        try {
          const r = await api<{ token: string }>("/api/cases", {
            patientName: String(f.get("name")),
            patientEmail: String(f.get("email")),
            homeCity: String(f.get("city") ?? ""),
            language: String(f.get("language")),
            quote: String(f.get("quote")),
          });
          router.push(`/p/${r.token}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setBusy(false);
        }
      }}
    >
      <div className="grid-3">
        <label className="field">
          Patient name
          <input name="name" required minLength={2} placeholder="Arjun Rao" />
        </label>
        <label className="field">
          Email for PayPal invoices
          <input name="email" type="email" required placeholder="you@example.com" />
        </label>
        <label className="field">
          Lives in
          <input name="city" placeholder="Toronto" />
        </label>
      </div>
      <label className="field">
        The clinic&apos;s quote, pasted as text
        <textarea name="quote" required minLength={40} rows={9} placeholder="Paste the treatment estimate from the clinic, with prices and visits." />
      </label>
      <div className="row">
        <label className="field">
          Explain the plan in
          <select name="language" defaultValue="English">
            {LANGS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Checking the quote…" : "Check quote and build plan"}
        </button>
      </div>
      <p className="small muted">Use made-up details. This is a sandbox demo and no real money moves.</p>
      {error && <p className="note warn" role="alert">{error}</p>}
    </form>
  );
}
