"use client";
import { useState } from "react";
import type { Bundle } from "./client";
import { api, fmt } from "./client";

const SAMPLE_NOTE =
  "Dr. K. Mehta, Edison NJ (fictional). Patient seen today: the zirconia crown on tooth 36, fitted in India, has a fractured edge on the cheek side. " +
  "No accident or sports injury reported and the follow-up check was attended. The crown needs to be replaced.";

type Verdict = { covered: boolean; matchedTerm: string | null; refundPercent: number; reasoning: string; needsHuman: boolean };

/** A dentist back home describes the problem; the AI checks it against the clinic's written warranty. */
export function ClaimPanel({ b, onDone }: { b: Bundle; onDone: () => void }) {
  const paid = b.stages.filter((s) => s.idx > 0 && s.paid_at);
  const [stageIdx, setStageIdx] = useState<number>(paid[paid.length - 1]?.idx ?? 0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ verdict: Verdict; refundCents: number } | null>(null);
  const cur = b.case.totals?.currency ?? "USD";

  return (
    <div className="card">
      <div className="card-head">
        <h2>Aftercare guarantee</h2>
        <p>Something went wrong after you flew home? Your dentist there can describe it here.</p>
      </div>
      <p className="small" style={{ marginBottom: 12 }}>
        <b>{b.clinic.name}</b> promises: {b.clinic.warranty_terms}
      </p>
      {paid.length === 0 ? (
        <p className="note info">Claims open once you have paid for a treatment stage.</p>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const r = await api<{ verdict: Verdict; refundCents: number }>("/api/claims", { token: b.case.public_token, stageIdx, note });
              setResult(r);
              setNote("");
              onDone();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Which treatment
            <select value={stageIdx} onChange={(e) => setStageIdx(Number(e.target.value))}>
              {paid.map((s) => (
                <option key={s.id} value={s.idx}>
                  {s.title} (paid {fmt(s.amount_cents, s.currency)})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Your dentist&apos;s note
            <textarea value={note} onChange={(e) => setNote(e.target.value)} minLength={20} required placeholder="What they found, and whether there was an accident." />
          </label>
          <div className="row">
            {b.case.demo && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNote(SAMPLE_NOTE)}>
                Use a sample note
              </button>
            )}
            <span className="spacer" />
            <button className="btn btn-primary" disabled={busy || note.trim().length < 20}>
              {busy ? "Checking the warranty…" : "Send claim to the clinic"}
            </button>
          </div>
          {error && <p className="note warn" role="alert">{error}</p>}
        </form>
      )}

      {result && <VerdictNote v={result.verdict} refund={result.refundCents} cur={cur} />}

      {b.claims.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 6 }}>Your claims</h3>
          {b.claims.map((c) => {
            const s = b.stages.find((x) => x.id === c.stage_id);
            return (
              <div className="issue" key={c.id}>
                <span className={`dot ${c.verdict?.covered ? "inconsistent" : "missing"}`} aria-hidden />
                <div>
                  <div>
                    {s?.title}: {c.verdict?.covered ? `covered, ${fmt(c.refund_cents, cur)} refund` : c.verdict?.needsHuman ? "sent to the clinic to decide" : "not covered"}
                  </div>
                  <div className="who">{c.status === "refunded" ? "Refunded to your PayPal account" : c.status === "open" ? "Waiting for the clinic to approve" : c.status}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VerdictNote({ v, refund, cur }: { v: Verdict; refund: number; cur: string }) {
  const cls = v.covered && !v.needsHuman ? "ok" : v.needsHuman ? "info" : "warn";
  return (
    <div className={`note ${cls}`} style={{ marginTop: 14 }} role="status">
      <b>{v.covered && !v.needsHuman ? `Covered: ${fmt(refund, cur)} can come back to you.` : v.needsHuman ? "A person at the clinic needs to look at this." : "This does not look covered."}</b>
      <p style={{ marginTop: 6 }}>{v.reasoning}</p>
      {v.matchedTerm && <p className="small" style={{ marginTop: 6 }}>Warranty wording used: “{v.matchedTerm}”</p>}
      {refund > 0 && <p className="small" style={{ marginTop: 6 }}>The clinic approves the refund, then PayPal returns it to the account you paid with.</p>}
    </div>
  );
}
