import "server-only";
import { generateText, tool } from "ai";
import { z } from "zod";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { model } from "./ai";
import { db, logEvent, must } from "./db";
import { env } from "./env";
import { loadCase, type CaseBundle, type Stage } from "./cases";
import { refundStage, requestId } from "./payments";
import { getInvoice } from "./paypal";

const DAY = 86_400_000;

/**
 * The agent never moves money directly. It proposes actions; code checks each one against hard limits;
 * a person approves; then the PayPal Agent Toolkit executes it with an idempotency key.
 */
type Proposal = { tool: string; args: Record<string, unknown>; reason: string };
type Check = { ok: boolean; rules: { rule: string; pass: boolean }[] };

function check(rules: [string, boolean][]): Check {
  return { ok: rules.every(([, p]) => p), rules: rules.map(([rule, pass]) => ({ rule, pass })) };
}

export function checkProposal(b: CaseBundle, p: Proposal): Check {
  const stage = (idx: unknown) => b.stages.find((s) => s.idx === Number(idx));
  switch (p.tool) {
    case "issue_stage_invoice": {
      const s = stage(p.args.stageIdx);
      const prev = s ? b.stages.find((x) => x.idx === s.idx - 1) : undefined;
      return check([
        ["Stage exists and is not the booking deposit", !!s && s.idx > 0],
        ["Previous stage is paid", !!prev && ["paid", "partially_refunded", "refunded"].includes(prev.status)],
        ["Stage is not paid yet", !!s && !["paid", "partially_refunded", "refunded"].includes(s.status)],
        ["Stage has no open invoice", !!s && !s.paypal_invoice_id],
        ["Amount is the agreed stage amount (agent cannot change prices)", !!s && s.amount_cents > 0],
      ]);
    }
    case "reschedule_stage": {
      const s = stage(p.args.stageIdx);
      const prev = s ? b.stages.find((x) => x.idx === s.idx - 1) : undefined;
      const newStart = new Date(String(p.args.newStart));
      const gapOk =
        !!s && !!prev?.ends_on && !Number.isNaN(newStart.getTime()) &&
        (newStart.getTime() - new Date(prev.ends_on).getTime()) / DAY >= s.min_gap_days;
      return check([
        ["Stage exists", !!s],
        ["Stage is not paid yet", !!s && !["paid", "partially_refunded", "refunded"].includes(s.status)],
        [`Keeps the ${s?.min_gap_days ?? 0}-day healing gap after the previous stage`, gapOk],
        ["New date is in the future", newStart.getTime() > Date.now()],
      ]);
    }
    case "refund_warranty_claim": {
      const claim = b.claims.find((c) => c.id === p.args.claimId) as { verdict?: { covered?: boolean; needsHuman?: boolean }; refund_cents: number; stage_id: string; status: string } | undefined;
      const s = b.stages.find((x) => x.id === claim?.stage_id);
      const left = s ? s.amount_cents - s.refunded_cents : 0;
      const within = !!s?.paid_at && Date.now() - new Date(s.paid_at).getTime() <= 180 * DAY;
      return check([
        ["Claim exists and is open", !!claim && claim.status === "open"],
        ["Warranty review says covered", !!claim?.verdict?.covered],
        ["Refund is not more than what is left on the stage", !!claim && claim.refund_cents > 0 && claim.refund_cents <= left],
        ["Within PayPal's 180-day refund window", within],
      ]);
    }
    default:
      return check([["Known action", false]]);
  }
}

async function propose(caseId: string, p: Proposal) {
  const b = (await loadCase({ id: caseId }))!;
  const lc = checkProposal(b, p);
  const row = must(
    await db()
      .from("agent_actions")
      .insert({ case_id: caseId, tool: p.tool, args: p.args, reason: p.reason, status: lc.ok ? "proposed" : "blocked", limit_check: lc })
      .select()
      .single(),
    "propose",
  ) as { id: string; status: string };
  await logEvent(caseId, "agent", lc.ok ? "action.proposed" : "action.blocked", { tool: p.tool, args: p.args, failed: lc.rules.filter((r) => !r.pass).map((r) => r.rule) });
  return { id: row.id, status: row.status, tool: p.tool, failed: lc.rules.filter((r) => !r.pass).map((r) => r.rule) };
}

function snapshot(b: CaseBundle) {
  return {
    today: new Date().toISOString().slice(0, 10),
    patient: b.case.patient_name,
    clinic: b.clinic.name,
    warrantyTerms: b.clinic.warranty_terms,
    stages: b.stages.map((s) => ({ idx: s.idx, title: s.title, trip: s.trip, startsOn: s.starts_on, endsOn: s.ends_on, minGapDays: s.min_gap_days, amount: (s.amount_cents / 100).toFixed(2) + " " + s.currency, status: s.status, hasInvoice: !!s.paypal_invoice_id })),
    openClaims: b.claims.filter((c: { status: string }) => c.status === "open"),
  };
}

/** Runs the clinic-side agent on a plain-language instruction and returns its message plus proposals. */
export async function runAgent(caseId: string, instruction: string) {
  const b = await loadCase({ id: caseId });
  if (!b) throw new Error("Case not found");
  const proposals: Awaited<ReturnType<typeof propose>>[] = [];
  const tools = {
    issue_stage_invoice: tool({
      description: "Propose issuing and sending the PayPal invoice for a treatment stage that is now due.",
      parameters: z.object({ stageIdx: z.number().int(), reason: z.string() }),
      execute: async (a) => {
        const r = await propose(caseId, { tool: "issue_stage_invoice", args: { stageIdx: a.stageIdx }, reason: a.reason });
        proposals.push(r);
        return r;
      },
    }),
    reschedule_stage: tool({
      description: "Propose moving a treatment stage (and every later stage) to a new start date.",
      parameters: z.object({ stageIdx: z.number().int(), newStart: z.string().describe("YYYY-MM-DD"), reason: z.string() }),
      execute: async (a) => {
        const r = await propose(caseId, { tool: "reschedule_stage", args: { stageIdx: a.stageIdx, newStart: a.newStart }, reason: a.reason });
        proposals.push(r);
        return r;
      },
    }),
    refund_warranty_claim: tool({
      description: "Propose refunding an open warranty claim that the review marked as covered.",
      parameters: z.object({ claimId: z.string(), reason: z.string() }),
      execute: async (a) => {
        const r = await propose(caseId, { tool: "refund_warranty_claim", args: { claimId: a.claimId }, reason: a.reason });
        proposals.push(r);
        return r;
      },
    }),
  };
  // One model step only: the model picks tool calls, and code writes the reply from what the rules decided.
  // (A second step would send tool results back to the model, which Gemini 3 rejects without thought signatures.)
  const { text } = await generateText({
    model: model(),
    temperature: 0,
    maxSteps: 1,
    tools,
    system:
      "You are Danta's clinic assistant. You manage the schedule and payments of one international dental patient. " +
      "Use tools to propose actions; you cannot move money yourself and a person approves every proposal. " +
      "If a proposal comes back blocked, explain which rule failed. Reply in two or three short sentences. Never give medical advice.",
    prompt: `Case:\n${JSON.stringify(snapshot(b))}\n\nInstruction from the clinic coordinator: ${instruction}`,
  });
  return { text: reply(text, proposals), proposals };
}

const TOOL_NAMES: Record<string, string> = {
  issue_stage_invoice: "send the PayPal invoice",
  reschedule_stage: "move the stage",
  refund_warranty_claim: "refund the claim",
};

/** Plain reply built from the rule results, so the explanation of a block always matches the check that made it. */
function reply(modelText: string, proposals: { status: string; failed: string[]; tool?: string }[]) {
  if (!proposals.length) return modelText.trim() || "I could not turn that into an action. Try naming the stage and the date or amount.";
  return proposals
    .map((p) => {
      const what = TOOL_NAMES[p.tool ?? ""] ?? "do that";
      return p.status === "blocked"
        ? `I can't ${what}: a rule blocked it (${p.failed.join("; ").toLowerCase()}).`
        : `I've proposed to ${what}. Every rule passed; approve it below to send it to PayPal.`;
    })
    .join(" ");
}

// ------------------------------------------------------------------ execution after approval

function toolkit(key: string) {
  return new PayPalAgentToolkit({
    clientId: env.paypalClientId,
    clientSecret: env.paypalSecret,
    configuration: {
      actions: { invoices: { create: true, send: true, cancel: true }, payments: { createRefund: true } },
      context: { sandbox: !env.paypalBase.includes("api-m.paypal.com"), request_id: key },
    },
  }).getTools();
}

async function runTool(key: string, name: string, args: Record<string, unknown>) {
  const t = toolkit(key)[name] as unknown as { execute: (a: unknown, o: unknown) => Promise<unknown> };
  if (!t) throw new Error(`PayPal Agent Toolkit has no tool ${name}`);
  const out = await t.execute(args, { toolCallId: key, messages: [] });
  // The toolkit reports PayPal errors as a JSON string instead of throwing; surface them.
  const text = typeof out === "string" ? out : JSON.stringify(out);
  if (/"error"\s*:/.test(text) || /"name"\s*:\s*"(UNPROCESSABLE_ENTITY|INVALID_REQUEST|VALIDATION_ERROR|AUTHENTICATION_FAILURE|NOT_AUTHORIZED|RESOURCE_NOT_FOUND)"/.test(text))
    throw new Error(`PayPal Agent Toolkit ${name}: ${text.slice(0, 600)}`);
  return out;
}

const findInvoiceId = (x: unknown) => JSON.stringify(x).match(/INV2-[A-Z0-9-]{10,}/)?.[0] ?? null;

async function issueInvoice(b: CaseBundle, s: Stage, actionId: string) {
  const [given, ...rest] = b.case.patient_name.split(" ");
  const created = await runTool(requestId("inv", s.id, actionId), "create_invoice", {
    currency_code: s.currency,
    note: `${s.title}, trip ${s.trip}. Paid through Danta; PayPal Purchase Protection applies.`,
    invoicer_business_name: b.clinic.name,
    primary_recipients: [{ billing_info: { name: { given_name: given, surname: rest.join(" ") || given }, email_address: b.case.patient_email } }],
    items: [{ name: s.title.slice(0, 200), description: `Trip ${s.trip}, ${s.starts_on} to ${s.ends_on}`, quantity: "1", unit_amount: { currency_code: s.currency, value: (s.amount_cents / 100).toFixed(2) } }],
  });
  const invoiceId = findInvoiceId(created);
  if (!invoiceId) throw new Error("PayPal did not return an invoice id");
  await runTool(requestId("send", s.id, actionId), "send_invoice", { invoice_id: invoiceId, send_to_recipient: true });
  const inv = await getInvoice(invoiceId);
  const url = inv.detail?.metadata?.recipient_view_url ?? null;
  await db().from("stages").update({ status: "invoiced", paypal_invoice_id: invoiceId, invoice_url: url }).eq("id", s.id);
  return { invoiceId, url };
}

async function shiftFrom(b: CaseBundle, s: Stage, newStart: string) {
  const delta = Math.round((new Date(newStart).getTime() - new Date(s.starts_on!).getTime()) / DAY);
  const later = b.stages.filter((x) => x.idx >= s.idx && x.starts_on);
  for (const x of later) {
    const st = new Date(new Date(x.starts_on!).getTime() + delta * DAY).toISOString().slice(0, 10);
    const en = new Date(new Date(x.ends_on!).getTime() + delta * DAY).toISOString().slice(0, 10);
    await db().from("stages").update({ starts_on: st, ends_on: en }).eq("id", x.id);
  }
  const moved: { invoice: string; reissued: unknown }[] = [];
  for (const x of later.filter((y) => y.status === "invoiced" && y.paypal_invoice_id)) {
    await runTool(requestId("cancel", x.id, x.paypal_invoice_id!), "cancel_sent_invoice", { invoice_id: x.paypal_invoice_id, send_to_recipient: true });
    await db().from("stages").update({ status: "due", paypal_invoice_id: null, invoice_url: null }).eq("id", x.id);
    const fresh = (await loadCase({ id: b.case.id }))!;
    const fx = fresh.stages.find((y) => y.id === x.id)!;
    moved.push({ invoice: x.paypal_invoice_id!, reissued: await issueInvoice(fresh, fx, `${x.id}-${newStart}`) });
  }
  return { shiftedDays: delta, stagesMoved: later.length, invoicesReissued: moved };
}

export async function decide(actionId: string, approve: boolean, by: string) {
  const a = must(await db().from("agent_actions").select("*").eq("id", actionId).single(), "action") as {
    id: string; case_id: string; tool: string; args: Record<string, unknown>; status: string; reason: string;
  };
  if (a.status !== "proposed") throw new Error(`Action is already ${a.status}.`);
  if (!approve) {
    await db().from("agent_actions").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", a.id);
    await logEvent(a.case_id, by, "action.rejected", { tool: a.tool });
    return { status: "rejected" };
  }
  // Re-check at approval time: the case may have changed since the proposal.
  const b = (await loadCase({ id: a.case_id }))!;
  const lc = checkProposal(b, { tool: a.tool, args: a.args, reason: a.reason });
  if (!lc.ok) {
    await db().from("agent_actions").update({ status: "blocked", limit_check: lc, decided_at: new Date().toISOString() }).eq("id", a.id);
    throw new Error(`Blocked: ${lc.rules.filter((r) => !r.pass).map((r) => r.rule).join("; ")}`);
  }
  const claimed = await db().from("agent_actions").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", a.id).eq("status", "proposed").select();
  if (!claimed.data?.length) throw new Error("Someone else already decided this action.");
  try {
    let result: unknown;
    if (a.tool === "issue_stage_invoice") {
      result = await issueInvoice(b, b.stages.find((s) => s.idx === Number(a.args.stageIdx))!, a.id);
    } else if (a.tool === "reschedule_stage") {
      result = await shiftFrom(b, b.stages.find((s) => s.idx === Number(a.args.stageIdx))!, String(a.args.newStart));
    } else if (a.tool === "refund_warranty_claim") {
      const claim = b.claims.find((c: { id: string }) => c.id === a.args.claimId) as { id: string; stage_id: string; refund_cents: number };
      result = await refundStage(claim.stage_id, claim.refund_cents, "Aftercare guarantee refund from your clinic, via Danta.", claim.id);
      await db().from("claims").update({ status: "refunded" }).eq("id", claim.id);
    }
    await db().from("agent_actions").update({ status: "executed", result }).eq("id", a.id);
    await logEvent(a.case_id, by, "action.executed", { tool: a.tool, result });
    return { status: "executed", result };
  } catch (e) {
    await db().from("agent_actions").update({ status: "failed", result: { error: String(e) } }).eq("id", a.id);
    throw e;
  }
}
