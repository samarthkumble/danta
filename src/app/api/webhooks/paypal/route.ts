import { db, logEvent } from "@/lib/db";
import { verifyWebhook } from "@/lib/paypal";
import { markPaid, syncInvoice } from "@/lib/payments";
import type { Stage } from "@/lib/cases";

type Evt = { id: string; event_type: string; resource: Record<string, unknown> & { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } } };

/**
 * PayPal webhooks. Every event is signature-verified with PayPal before it can change anything,
 * and stored by event id so a re-delivered event is processed once.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let evt: Evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const verified = await verifyWebhook(req.headers, raw).catch(() => false);
  const ins = await db().from("webhook_events").insert({ id: evt.id, event_type: evt.event_type, verified, resource: evt.resource });
  if (ins.error?.code === "23505") return Response.json({ ok: true, duplicate: true });
  if (!verified) {
    await logEvent(null, "paypal", "webhook.rejected", { id: evt.id, type: evt.event_type });
    return Response.json({ error: "signature not verified" }, { status: 400 });
  }
  if (evt.event_type === "INVOICING.INVOICE.PAID") {
    const invId = (evt.resource as { invoice?: { id?: string } }).invoice?.id ?? evt.resource.id;
    const s = (await db().from("stages").select("*").eq("paypal_invoice_id", invId).maybeSingle()).data as Stage | null;
    if (s) await syncInvoice(s);
  } else if (evt.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const orderId = evt.resource.supplementary_data?.related_ids?.order_id;
    const s = orderId ? ((await db().from("stages").select("*").eq("paypal_order_id", orderId).maybeSingle()).data as Stage | null) : null;
    if (s && evt.resource.id) await markPaid(s, String(evt.resource.id), "order");
  }
  await db().from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("id", evt.id);
  return Response.json({ ok: true });
}
