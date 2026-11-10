"use client";
import { useMemo, useState } from "react";
import type { Bundle } from "./client";
import { fmt } from "./client";

const KIND: Record<string, string> = { missing: "Missing", risk: "Risk", unclear: "Unclear", inconsistent: "Does not add up" };

/** Finds a line the AI copied from the quote, tolerating spacing differences. */
function locate(text: string, needle: string | null | undefined): [number, number] | null {
  if (!needle) return null;
  const exact = text.indexOf(needle);
  if (exact >= 0) return [exact, exact + needle.length];
  const words = needle.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return null;
  const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s.]*"), "i");
  const m = re.exec(text);
  if (!m) return null;
  const end = text.indexOf("\n", m.index);
  return [m.index, end < 0 ? text.length : end];
}

export function QuotePanel({ b, issues }: { b: Bundle; issues?: string[] }) {
  const plan = b.case.plan!;
  const cur = plan.currency;
  const [active, setActive] = useState<number | null>(null);
  const quote = b.case.quote_text;
  const span = useMemo(() => (active === null ? null : locate(quote, plan.items[active]?.sourceQuote)), [active, quote, plan.items]);
  const total = plan.items.reduce((a, i) => a + Math.round(i.lineTotal * 100), 0);

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h2>What the quote says</h2>
          <p>Select a line to see where it came from.</p>
        </div>
        <table className="items">
          <thead>
            <tr>
              <th>Item</th>
              <th>Stage</th>
              <th style={{ textAlign: "right" }}>Price</th>
            </tr>
          </thead>
          <tbody>
            {plan.items.map((it, i) => (
              <tr
                key={i}
                className={active === i ? "active" : undefined}
                tabIndex={0}
                onClick={() => setActive(active === i ? null : i)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setActive(active === i ? null : i))}
                aria-pressed={active === i}
              >
                <td>
                  {it.description}
                  {it.tooth && <span className="muted small"> (tooth {it.tooth})</span>}
                </td>
                <td>{it.stage}</td>
                <td className="amt num">{fmt(Math.round(it.lineTotal * 100), cur)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Lines add up to</td>
              <td className="amt num">{fmt(total, cur)}</td>
            </tr>
          </tfoot>
        </table>
        <details style={{ marginTop: 14 }} open={active !== null}>
          <summary className="small" style={{ cursor: "pointer" }}>
            The clinic&apos;s original quote
          </summary>
          <div className="quote-doc" style={{ marginTop: 10 }}>
            {span ? (
              <>
                {quote.slice(0, span[0])}
                <mark>{quote.slice(span[0], span[1])}</mark>
                {quote.slice(span[1])}
              </>
            ) : (
              quote
            )}
          </div>
        </details>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Ask the clinic before you pay</h2>
          <p>{b.case.issues.length ? `${b.case.issues.length} things to check` : "Nothing found"}</p>
        </div>
        {b.case.issues.length === 0 && <p className="small muted">The arithmetic checks out and nothing obvious is missing.</p>}
        {b.case.issues.map((is, i) => (
          <div className="issue" key={i}>
            <span className={`dot ${is.kind}`} aria-hidden />
            <div>
              <div>{issues?.[i] ?? is.message}</div>
              <div className="who">
                {KIND[is.kind]}, found by {is.by === "code" ? "a rule in code" : "the AI reading the quote"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
