"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useState } from "react";
import { TopBar } from "./TopBar";
import { AgentPanel } from "./AgentPanel";
import type { Bundle, Evt } from "./client";
import { PAID, day, fmt, stageClass, stageLabel, useCase } from "./client";

const Schedule = dynamic(() => import("./Schedule"), { ssr: false, loading: () => <div className="sched-host skeleton" /> });

export function ClinicView({ id }: { id: string }) {
  const { data: b, error, reload } = useCase(id, 10000);
  const [pending, setPending] = useState<string | null>(null);
  const reloadNow = useCallback(async () => reload(), [reload]);

  if (error && !b)
    return (
      <Shell>
        <p className="note warn section">This case could not be opened: {error}</p>
      </Shell>
    );
  if (!b)
    return (
      <Shell>
        <div className="section stack">
          <div className="skeleton" style={{ height: 40, width: "40%" }} />
          <div className="skeleton" style={{ height: 360 }} />
        </div>
      </Shell>
    );

  const cur = b.case.totals?.currency ?? "USD";
  const total = b.stages.reduce((a, s) => a + s.amount_cents, 0);
  const received = b.stages.filter((s) => PAID.includes(s.status)).reduce((a, s) => a + s.amount_cents, 0);
  const refunded = b.stages.reduce((a, s) => a + s.refunded_cents, 0);

  async function onMove(stageIdx: number, newStart: string) {
    const s = b!.stages.find((x) => x.idx === stageIdx);
    if (pending) return;
    setPending(`Move ${s?.title ?? `stage ${stageIdx}`} to ${newStart}`);
    try {
      await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: b!.case.id, instruction: `The coordinator dragged stage ${stageIdx} ("${s?.title}") on the timeline to start on ${newStart}. Propose that reschedule.` }),
      });
    } finally {
      await reload();
      setPending(null);
    }
  }

  return (
    <Shell patientHref={`/p/${b.case.public_token}`}>
      <section className="section" style={{ paddingBottom: 16 }}>
        <p className="muted">{b.clinic.name}, international patients</p>
        <div className="row" style={{ alignItems: "baseline", marginTop: 6 }}>
          <h1 style={{ fontSize: "clamp(1.8rem, 3.4vw, 2.6rem)" }}>{b.case.patient_name}</h1>
          <span className="muted">from {b.case.home_city || "abroad"}</span>
        </div>
        <div className="grid-3" style={{ marginTop: 18 }}>
          <Figure label="Treatment value" value={fmt(total, cur)} />
          <Figure label="Received through PayPal" value={fmt(received, cur)} />
          <Figure label="Refunded under the guarantee" value={fmt(refunded, cur)} />
        </div>
      </section>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <h2>Both trips</h2>
          <p>The engine keeps the healing time between trips. Drag an unpaid stage to ask the assistant to move it.</p>
        </div>
        <Schedule b={b} onMove={onMove} />
      </div>

      <div className="grid-2">
        <AgentPanel b={b} reload={reloadNow} pending={pending} setPending={setPending} />
        <div className="stack">
          <Ledger b={b} />
          <Activity events={b.events} />
        </div>
      </div>
    </Shell>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="small muted">{label}</div>
      <div className="stat num" style={{ fontSize: "1.7rem", marginTop: 6 }}>{value}</div>
    </div>
  );
}

function Ledger({ b }: { b: Bundle }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Ledger</h2>
        <p>Every amount ties to a PayPal reference.</p>
      </div>
      <table className="items">
        <thead>
          <tr>
            <th>Stage</th>
            <th>Status</th>
            <th style={{ textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {b.stages.map((s) => {
            const ref = s.paypal_capture_id ?? s.paypal_invoice_id ?? s.paypal_order_id;
            return (
              <tr key={s.id} style={{ cursor: "default" }}>
                <td>
                  {s.title}
                  <div className="small muted">{ref ? `PayPal ${ref}` : s.status === "planned" ? `Starts ${day(s.starts_on)}` : "Not paid yet"}</div>
                </td>
                <td>
                  <span className={`pill ${stageClass(s)}`}>{stageLabel(s)}</span>
                </td>
                <td className="amt num">
                  {fmt(s.amount_cents, s.currency)}
                  {s.refunded_cents > 0 && <div className="small" style={{ color: "var(--alert)" }}>−{fmt(s.refunded_cents, s.currency)}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const KIND: Record<string, string> = {
  "plan.extracted": "Quote read and checked",
  "order.created": "PayPal order created",
  "payment.captured": "Payment captured",
  "invoice.paid": "PayPal invoice paid",
  "refund.created": "Refund sent",
  "action.proposed": "Assistant proposed",
  "action.blocked": "Rule blocked a proposal",
  "action.rejected": "Proposal rejected",
  "action.executed": "Approved and executed",
  "claim.submitted": "Warranty claim received",
};

function Activity({ events }: { events: Evt[] }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Activity</h2>
        <p>Who did what, newest first.</p>
      </div>
      <ul className="log">
        {events.map((e) => (
          <li key={e.id}>
            <time dateTime={e.created_at}>{new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            <span>
              <b>{KIND[e.kind] ?? e.kind}</b> <span className="muted">by {e.actor}</span>
              {typeof e.detail.stage === "string" && <span className="muted">, {e.detail.stage}</span>}
              {Array.isArray(e.detail.failed) && e.detail.failed.length > 0 && <span style={{ display: "block", color: "var(--alert)" }}>{(e.detail.failed as string[]).join("; ")}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Shell({ children, patientHref }: { children: React.ReactNode; patientHref?: string }) {
  return (
    <>
      <TopBar current="clinic" />
      <main className="wrap" style={{ paddingBottom: 60 }}>
        {patientHref && (
          <p className="small" style={{ paddingTop: 16 }}>
            <Link href={patientHref}>See what the patient sees</Link>
          </p>
        )}
        {children}
      </main>
    </>
  );
}
