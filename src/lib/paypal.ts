import "server-only";
import { env } from "./env";

/**
 * Thin PayPal REST client for the sandbox.
 * Every write sends a PayPal-Request-Id so a retried call can never charge, invoice or refund twice.
 */

let cached: { token: string; expires: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const res = await fetch(`${env.paypalBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.paypalClientId}:${env.paypalSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new PayPalError(`OAuth failed (${res.status})`, res.status, await res.text());
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, expires: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string,
  ) {
    super(message);
  }
}

type Opts = { method?: string; body?: unknown; requestId?: string; headers?: Record<string, string> };

export async function pp<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await token()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...opts.headers,
  };
  if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;
  const res = await fetch(`${env.paypalBase}${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `PayPal ${opts.method ?? "GET"} ${path} failed (${res.status})`;
    try {
      const j = JSON.parse(text) as { message?: string; details?: { issue?: string; description?: string }[] };
      const d = j.details?.[0];
      msg = d ? `${d.issue}: ${d.description}` : (j.message ?? msg);
    } catch {}
    throw new PayPalError(msg, res.status, text);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export const money = (cents: number, currency = "USD") => ({ currency_code: currency, value: (cents / 100).toFixed(2) });

// ---------------------------------------------------------------- Orders v2

export type PPOrder = {
  id: string;
  status: string;
  links?: { href: string; rel: string }[];
  purchase_units?: {
    reference_id?: string;
    custom_id?: string;
    payments?: { captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[] };
  }[];
};

export function createOrder(p: {
  amountCents: number;
  currency: string;
  referenceId: string;
  customId: string;
  description: string;
  requestId: string;
  clinicName: string;
}) {
  return pp<PPOrder>("/v2/checkout/orders", {
    requestId: p.requestId,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: p.referenceId,
          custom_id: p.customId,
          description: p.description.slice(0, 127),
          soft_descriptor: "DANTA",
          amount: money(p.amountCents, p.currency),
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: p.clinicName.slice(0, 127),
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: `${env.appUrl}/paypal/return`,
            cancel_url: `${env.appUrl}/paypal/cancel`,
          },
        },
      },
    },
  });
}

export function getOrder(id: string) {
  return pp<PPOrder>(`/v2/checkout/orders/${encodeURIComponent(id)}`);
}

export function captureOrder(id: string, requestId: string) {
  return pp<PPOrder>(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, { requestId, body: {} });
}

export function refundCapture(captureId: string, cents: number, currency: string, requestId: string, note: string) {
  return pp<{ id: string; status: string; amount: { value: string } }>(
    `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
    { requestId, body: { amount: money(cents, currency), note_to_payer: note.slice(0, 255) } },
  );
}

// ---------------------------------------------------------------- Invoicing v2

export type PPInvoice = {
  id: string;
  status: string;
  detail?: { metadata?: { recipient_view_url?: string; invoicer_view_url?: string } };
  payments?: { transactions?: { payment_id: string }[] };
};

export function getInvoice(id: string) {
  return pp<PPInvoice>(`/v2/invoicing/invoices/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------- Webhooks

/** Verifies a webhook with PayPal's own signature check. Unverified events are stored but never acted on. */
export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  if (!env.paypalWebhookId) return false;
  const h = (n: string) => headers.get(n) ?? "";
  const res = await pp<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
    body: {
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: env.paypalWebhookId,
      webhook_event: JSON.parse(rawBody),
    },
  });
  return res.verification_status === "SUCCESS";
}
