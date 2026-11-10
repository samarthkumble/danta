"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { TopBar } from "./TopBar";
import { Trips } from "./Trips";
import { QuotePanel } from "./QuotePanel";
import { ClaimPanel } from "./ClaimPanel";
import { PayPalPay } from "./PayPalPay";
import { PAID, api, fmt, useCase } from "./client";
import type { Stage } from "@/lib/cases";

type Translation = { summary: string; stages: { number: number; title: string; explanation: string }[]; issues: string[] };
const LANGS = ["English", "Hindi", "Kannada", "Malayalam", "Tamil", "Telugu", "Gujarati", "Punjabi", "Bengali", "Marathi", "Arabic"];

export function PatientView({ token }: { token: string }) {
  const { data: b, error, reload } = useCase(token, 15000);
  const [lang, setLang] = useState<string | null>(null);
  const [tr, setTr] = useState<Translation | null>(null);
  const [trBusy, setTrBusy] = useState(false);
  const [trError, setTrError] = useState<string | null>(null);
  const onPaid = useCallback(() => void reload(), [reload]);

  if (error && !b) return <Shell><p className="note warn">This plan could not be opened: {error}</p></Shell>;
  if (!b) return <Shell><Loading /></Shell>;
  if (!b.case.plan) return <Shell><p className="note warn">This case has no plan yet.</p></Shell>;

  const plan = b.case.plan;
  const cur = b.case.totals?.currency ?? plan.currency;
  const total = b.stages.reduce((a, s) => a + s.amount_cents, 0);
  const paid = b.stages.filter((s) => PAID.includes(s.status)).reduce((a, s) => a + s.amount_cents - s.refunded_cents, 0);
  const language = lang ?? b.case.language ?? "English";
  const sorted = [...plan.stages].sort((a, z) => a.number - z.number);
  const explain = (s: Stage) => (s.idx > 0 && tr ? tr.stages.find((x) => x.number === sorted[s.idx - 1]?.number)?.explanation : undefined);
  const first = b.case.patient_name.split(" ")[0];

  async function pickLanguage(l: string) {
    setLang(l);
    setTrError(null);
    if (l === "English") return setTr(null);
    setTrBusy(true);
    try {
      setTr(await api<Translation>("/api/translate", { token, language: l }));
    } catch (e) {
      setTrError(e instanceof Error ? e.message : String(e));
      setTr(null);
    } finally {
      setTrBusy(false);
    }
  }

  const extra = (s: Stage) => {
    if (s.status === "due")
      return (
        <div style={{ padding: "6px 0 12px" }}>
          <PayPalPay stageId={s.id} currency={s.currency} onPaid={onPaid} />
        </div>
      );
    if (s.status === "invoiced")
      return (
        <div className="row" style={{ padding: "4px 0 12px" }}>
          {s.invoice_url && (
            <a className="btn btn-gold btn-sm" href={s.invoice_url} target="_blank" rel="noreferrer">
              Pay the PayPal invoice
            </a>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await api(`/api/stages/${s.id}/sync`, {}).catch(() => null);
              void reload();
            }}
          >
            I have paid, check now
          </button>
        </div>
      );
    return null;
  };

  return (
    <Shell clinicHref={b.case.demo ? `/clinic/${b.case.id}` : undefined}>
      <section className="section" style={{ paddingBottom: 12 }}>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div>
            <p className="muted">{first}&apos;s treatment plan with {b.clinic.name}</p>
            <h1 style={{ fontSize: "clamp(1.8rem, 3.4vw, 2.6rem)", marginTop: 6 }}>
              {fmt(paid, cur)} paid of {fmt(total, cur)}
            </h1>
          </div>
          <span className="spacer" />
          <label className="field" style={{ minWidth: 200 }}>
            Explain the plan in
            <select value={language} onChange={(e) => void pickLanguage(e.target.value)} disabled={trBusy}>
              {LANGS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="lede" style={{ marginTop: 14, maxWidth: "48em", color: "var(--ink-2)" }} lang={tr ? undefined : "en"}>
          {trBusy ? "Translating…" : tr?.summary ?? plan.summary}
        </p>
        {trError && <p className="note warn" style={{ marginTop: 10 }}>{trError}</p>}
        {b.case.demo && <DemoGuide b={b} />}
      </section>

      <div className="grid-2">
        <div className="stack">
          <Trips stages={b.stages} from={b.case.home_city?.split(",")[0] || "Home"} to={b.clinic.city.split(",")[0]} explain={explain} extra={extra} />
          <p className="small muted">
            Amounts come from the quote&apos;s own lines, added up in code. Paying through PayPal means each stage is covered by PayPal&apos;s buyer
            protection and can be refunded for 180 days.
          </p>
          <ClaimPanel b={b} onDone={onPaid} />
        </div>
        <QuotePanel b={b} issues={tr?.issues} />
      </div>
    </Shell>
  );
}

function DemoGuide({ b }: { b: NonNullable<ReturnType<typeof useCase>["data"]> }) {
  const deposit = b.stages.find((s) => s.idx === 0);
  const step = !deposit || deposit.status === "due" ? 0 : b.stages.some((s) => s.idx > 0 && s.paid_at) ? 2 : 1;
  const tips = [
    "Start by paying the booking deposit below with the PayPal sandbox buyer account from the README. No real money moves.",
    "Deposit paid. Open the clinic console to see both trips on the timeline and ask the assistant to invoice the next stage.",
    "A stage is paid. Try the aftercare guarantee: use the sample dentist note and watch the claim become a refund proposal for the clinic.",
  ];
  return (
    <div className="note info row" style={{ marginTop: 16 }}>
      <span>
        <b>Demo, step {step + 1} of 3.</b> {tips[step]}
      </span>
      {step > 0 && (
        <Link className="btn btn-primary btn-sm" href={`/clinic/${b.case.id}`}>
          Open the clinic console
        </Link>
      )}
    </div>
  );
}

function Shell({ children, clinicHref }: { children: React.ReactNode; clinicHref?: string }) {
  return (
    <>
      <TopBar current="patient" clinicHref={clinicHref} />
      <main className="wrap" style={{ paddingBottom: 60 }}>
        {children}
      </main>
    </>
  );
}

function Loading() {
  return (
    <div className="section stack" aria-busy>
      <div className="skeleton" style={{ height: 40, width: "50%" }} />
      <div className="skeleton" style={{ height: 220 }} />
      <div className="skeleton" style={{ height: 160 }} />
    </div>
  );
}
