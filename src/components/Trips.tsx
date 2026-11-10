"use client";
import type { Stage } from "@/lib/cases";
import { PAID, day, fmt, stageClass, stageLabel } from "./client";

export type StageExtra = (s: Stage) => React.ReactNode;

/** Groups stages into trips and shows each trip as a boarding pass, with healing time between them. */
export function Trips({ stages, from, to, explain, extra }: { stages: Stage[]; from: string; to: string; explain?: (s: Stage) => string | undefined; extra?: StageExtra }) {
  const trips = [...new Set(stages.map((s) => s.trip))].sort((a, b) => a - b);
  return (
    <div className="trips">
      {trips.map((t, ti) => {
        const list = stages.filter((s) => s.trip === t);
        const firstTreatment = list.find((s) => s.idx > 0);
        const prevTrip = ti > 0 ? stages.filter((s) => s.trip === trips[ti - 1]) : [];
        const due = list.reduce((a, s) => a + s.amount_cents, 0);
        const paid = list.filter((s) => PAID.includes(s.status)).reduce((a, s) => a + s.amount_cents - s.refunded_cents, 0);
        const refunded = list.some((s) => s.refunded_cents > 0);
        const allPaid = list.every((s) => PAID.includes(s.status));
        const cur = list[0]?.currency ?? "USD";
        return (
          <div key={t}>
            {ti > 0 && <Healing prev={prevTrip} next={firstTreatment} />}
            <div className="pass">
              <div className="pass-main">
                <span className="pass-tag">Trip {t}</span>
                <div className="pass-route">
                  {from} <span className="plane" aria-hidden>✈</span> {to}
                </div>
                <p className="small muted" style={{ marginBottom: 8 }}>
                  {firstTreatment ? `${day(firstTreatment.starts_on)} to ${day(list[list.length - 1].ends_on)}` : "Dates to be set"}
                </p>
                {list.map((s) => (
                  <div key={s.id}>
                    <div className="pass-stage">
                      <span>
                        {s.title}
                        <span className="muted small"> {s.idx === 0 ? `by ${day(s.starts_on)}` : ""}</span>
                        {explain?.(s) && <span className="small muted" style={{ display: "block" }}>{explain(s)}</span>}
                      </span>
                      <span className="num">
                        {fmt(s.amount_cents, s.currency)}
                        {s.refunded_cents > 0 && <span className="small" style={{ display: "block", color: "var(--alert)" }}>−{fmt(s.refunded_cents, s.currency)}</span>}
                      </span>
                      <span className={`pill ${stageClass(s)}`}>{stageLabel(s)}</span>
                    </div>
                    {extra?.(s)}
                  </div>
                ))}
              </div>
              <div className="pass-stub">
                <span className="small muted">Paid for this trip</span>
                <span className="amount num">
                  {fmt(paid, cur)}
                  <span className="small muted" style={{ display: "block", fontWeight: 400, fontFamily: "var(--font-body)" }}>
                    of {fmt(due, cur)}
                  </span>
                </span>
                {allPaid && <span className={`stamp${refunded ? " refunded" : ""}`}>{refunded ? "Part refunded" : "Paid with PayPal"}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Healing({ prev, next }: { prev: Stage[]; next?: Stage }) {
  const gap = next?.min_gap_days ?? 0;
  const last = prev[prev.length - 1];
  const months = Math.round(gap / 30);
  return (
    <div className="healing">
      {gap > 0 ? `${months >= 2 ? `${months} months` : `${gap} days`} of healing at home` : "Time at home"}
      {last?.ends_on && next?.starts_on && <span className="small muted" style={{ fontWeight: 400 }}>back on {day(next.starts_on)}</span>}
    </div>
  );
}
