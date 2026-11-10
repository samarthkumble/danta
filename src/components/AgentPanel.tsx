"use client";
import { useState } from "react";
import type { Action, Bundle } from "./client";
import { api, fmt } from "./client";

const TOOL: Record<string, string> = {
  issue_stage_invoice: "Send a PayPal invoice",
  reschedule_stage: "Move a stage",
  refund_warranty_claim: "Refund a warranty claim",
};

function describe(a: Action, b: Bundle) {
  const s = b.stages.find((x) => x.idx === a.args.stageIdx);
  if (a.tool === "issue_stage_invoice") return s ? `${s.title}, ${fmt(s.amount_cents, s.currency)} to ${b.case.patient_email}` : `Stage ${a.args.stageIdx}`;
  if (a.tool === "reschedule_stage") return `${s?.title ?? `Stage ${a.args.stageIdx}`} to start on ${a.args.newStart}, with every later stage moving the same number of days`;
  const c = b.claims.find((x) => x.id === a.args.claimId);
  return c ? `${fmt(c.refund_cents, b.case.totals?.currency)} back to the patient's PayPal account` : "Claim";
}

/** The clinic's assistant proposes; rules in code check; a person approves; the PayPal Agent Toolkit executes. */
export function AgentPanel({ b, reload, pending, setPending }: { b: Bundle; reload: () => Promise<void>; pending: string | null; setPending: (s: string | null) => void }) {
  const [text, setText] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const first = b.case.patient_name.split(" ")[0];
  const openClaim = b.claims.find((c) => c.status === "open" && c.refund_cents > 0);
  const chips = [
    "Invoice the next stage that is due",
    `${first}'s flight moved. Start trip 1 a week later.`,
    "Bring trip 2 forward to three weeks after trip 1",
    ...(openClaim ? ["Refund the open warranty claim"] : []),
  ];

  async function ask(instruction: string) {
    setPending(instruction);
    setError(null);
    setReply(null);
    try {
      const r = await api<{ text: string }>("/api/agent", { caseId: b.case.id, instruction });
      setReply(r.text || "Done. See the proposals below.");
      setText("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  async function decide(a: Action, approve: boolean) {
    setDeciding(a.id);
    setError(null);
    try {
      await api(`/api/actions/${a.id}`, { approve });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      await reload();
      setDeciding(null);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Clinic assistant</h2>
        <p>It proposes. Rules check. You approve. PayPal executes.</p>
      </div>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 3) void ask(text.trim());
        }}
      >
        <label className="field">
          Ask the assistant
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Send the crown invoice, or move trip 2 to 15 June" disabled={!!pending} />
        </label>
        <div className="chips">
          {chips.map((c) => (
            <button type="button" className="chip" key={c} disabled={!!pending} onClick={() => void ask(c)}>
              {c}
            </button>
          ))}
        </div>
      </form>
      {pending && <p className="agent-reply" style={{ marginTop: 12 }} aria-live="polite">Working on “{pending}”…</p>}
      {reply && !pending && <p className="agent-reply" style={{ marginTop: 12 }} aria-live="polite">{reply}</p>}
      {error && <p className="note warn" style={{ marginTop: 12 }} role="alert">{error}</p>}

      <h3 style={{ margin: "20px 0 10px" }}>Proposals</h3>
      {b.actions.length === 0 && <p className="small muted">Nothing proposed yet. Try one of the suggestions above, or drag a stage on the timeline.</p>}
      {b.actions.slice(0, 8).map((a) => (
        <div className="proposal" key={a.id}>
          <div className="row">
            <b>{TOOL[a.tool] ?? a.tool}</b>
            <span className={`pill ${a.status === "executed" ? "paid" : a.status === "blocked" || a.status === "failed" ? "blocked" : a.status === "proposed" ? "due" : ""}`}>{statusText(a.status)}</span>
          </div>
          <p className="small" style={{ marginTop: 6 }}>{describe(a, b)}</p>
          <p className="small muted" style={{ marginTop: 4 }}>Why: {a.reason}</p>
          {a.limit_check && (
            <ul className="rules">
              {a.limit_check.rules.map((r) => (
                <li key={r.rule}>
                  <span className={r.pass ? "ok" : "no"} aria-label={r.pass ? "passed" : "failed"}>{r.pass ? "✓" : "✗"}</span>
                  {r.rule}
                </li>
              ))}
            </ul>
          )}
          {a.status === "failed" && <p className="note warn small">{String((a.result as { error?: string } | null)?.error ?? "PayPal returned an error.")}</p>}
          {a.status === "proposed" && (
            <div className="row">
              <button className="btn btn-good btn-sm" disabled={deciding === a.id} onClick={() => void decide(a, true)}>
                {deciding === a.id ? "Sending to PayPal…" : "Approve"}
              </button>
              <button className="btn btn-bad btn-sm" disabled={deciding === a.id} onClick={() => void decide(a, false)}>
                Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function statusText(s: Action["status"]) {
  return { proposed: "Waiting for you", blocked: "Blocked by a rule", approved: "Approved", executed: "Done in PayPal", rejected: "Rejected", failed: "Failed" }[s];
}
