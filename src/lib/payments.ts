import "server-only";
import { db, logEvent, must } from "./db";
import { captureOrder, createOrder, getInvoice, getOrder, refundCapture } from "./paypal";
import type { Clinic, Stage } from "./cases";

/** Stable request id per money movement: a retry reuses it, so PayPal treats it as the same request. */
export const requestId = (...parts: (string | number)[]) => `danta-${parts.join("-")}`.slice(0, 108);

async function stageWithCase(stageId: string) {
  const s = must(await db().from("stages").select("*").eq("id", stageId).single(), "stage") as Stage;
  const c = must(await db().from("cases").select("id, clinic_id, patient_name").eq("id", s.case_id).single(), "case") as {
    id: string;
    clinic_id: string;
    patient_name: string;
  };
  const clinic = must(await db().from("clinics").select("*").eq("id", c.clinic_id).single(), "clinic") as Clinic;
  return { s, c, clinic };
}

/** Creates (or returns the existing) PayPal order for a stage that is due. */
export async function orderForStage(stageId: string) {
  const { s, c, clinic } = await stageWithCase(stageId);
  if (s.status !== "due") throw new Error(`This payment is ${s.status}, not due.`);
  if (s.amount_cents <= 0) throw new Error("Nothing to pay for this stage.");
  if (s.paypal_order_id) {
    const existing = await getOrder(s.paypal_order_id);
    if (["CREATED", "APPROVED", "PAYER_ACTION_REQUIRED"].includes(existing.status)) return { orderId: existing.id };
  }
  const order = await createOrder({
    amountCents: s.amount_cents,
    currency: s.currency,
    referenceId: s.id,
    customId: c.id,
    description: `${clinic.name}: ${s.title} for ${c.patient_name}`,
    requestId: requestId("order", s.id, s.paypal_order_id ? "r" : "1"),
    clinicName: clinic.name,
  });
  await db().from("stages").update({ paypal_order_id: order.id }).eq("id", s.id);
  await logEvent(c.id, "patient", "order.created", { stage: s.title, orderId: order.id, amount: s.amount_cents });
  return { orderId: order.id };
}

/** Captures an approved order. Safe to call twice: the second call finds the stage already paid. */
export async function captureStage(stageId: string, orderId: string) {
  const { s, c } = await stageWithCase(stageId);
  if (s.status === "paid") return { already: true, captureId: s.paypal_capture_id };
  if (s.paypal_order_id !== orderId) throw new Error("This order does not belong to this payment.");
  const order = await captureOrder(orderId, requestId("capture", s.id, orderId));
  const cap = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (!cap || cap.status !== "COMPLETED") throw new Error(`Payment not completed (${cap?.status ?? order.status}).`);
  const paidCents = Math.round(Number(cap.amount.value) * 100);
  if (paidCents !== s.amount_cents) throw new Error("Captured amount does not match the stage amount.");
  await markPaid(s, cap.id, "order");
  await logEvent(c.id, "paypal", "payment.captured", { stage: s.title, captureId: cap.id, amount: paidCents });
  return { already: false, captureId: cap.id };
}

/** Marks a stage paid exactly once (the status guard makes a duplicate webhook harmless) and opens the next one. */
export async function markPaid(s: Stage, captureId: string, via: "order" | "invoice") {
  const upd = await db()
    .from("stages")
    .update({ status: "paid", paypal_capture_id: captureId, paid_at: new Date().toISOString() })
    .eq("id", s.id)
    .neq("status", "paid")
    .select();
  if (!upd.data?.length) return false;
  await db()
    .from("payments")
    .upsert(
      { case_id: s.case_id, stage_id: s.id, kind: s.idx === 0 ? "deposit" : "stage", amount_cents: s.amount_cents, currency: s.currency, paypal_ref: captureId, status: "completed", request_id: requestId("pay", s.id) },
      { onConflict: "request_id", ignoreDuplicates: true },
    );
  if (s.idx === 0) await db().from("cases").update({ status: "booked", updated_at: new Date().toISOString() }).eq("id", s.case_id);
  await db().from("stages").update({ status: "due" }).eq("case_id", s.case_id).eq("idx", s.idx + 1).eq("status", "planned");
  void via;
  return true;
}

/** Refund part of a paid stage, never more than what is left, only within PayPal's 180-day window. */
export async function refundStage(stageId: string, cents: number, note: string, key: string) {
  const { s, c } = await stageWithCase(stageId);
  if (!s.paypal_capture_id || !["paid", "partially_refunded"].includes(s.status)) throw new Error("Only a paid stage can be refunded.");
  const left = s.amount_cents - s.refunded_cents;
  if (cents <= 0 || cents > left) throw new Error(`Refund must be between 0.01 and ${(left / 100).toFixed(2)}.`);
  if (s.paid_at && Date.now() - new Date(s.paid_at).getTime() > 180 * 86_400_000) throw new Error("PayPal refunds are only possible within 180 days of payment.");
  const r = await refundCapture(s.paypal_capture_id, cents, s.currency, requestId("refund", s.id, key), note);
  const refunded = s.refunded_cents + cents;
  await db()
    .from("stages")
    .update({ refunded_cents: refunded, status: refunded >= s.amount_cents ? "refunded" : "partially_refunded" })
    .eq("id", s.id);
  await db()
    .from("payments")
    .upsert(
      { case_id: c.id, stage_id: s.id, kind: "refund", amount_cents: cents, currency: s.currency, paypal_ref: r.id, status: r.status.toLowerCase(), request_id: requestId("refund", s.id, key) },
      { onConflict: "request_id", ignoreDuplicates: true },
    );
  await logEvent(c.id, "paypal", "refund.created", { stage: s.title, refundId: r.id, amount: cents });
  return r;
}

/** Syncs an invoiced stage from PayPal (used by the webhook and as a manual "check payment" fallback). */
export async function syncInvoice(stage: Stage) {
  if (!stage.paypal_invoice_id) return false;
  const inv = await getInvoice(stage.paypal_invoice_id);
  if (inv.status === "PAID" || inv.status === "MARKED_AS_PAID") {
    const capId = inv.payments?.transactions?.[0]?.payment_id ?? "";
    const done = await markPaid(stage, capId, "invoice");
    if (done) await logEvent(stage.case_id, "paypal", "invoice.paid", { stage: stage.title, invoiceId: inv.id, captureId: capId });
    return true;
  }
  return false;
}
