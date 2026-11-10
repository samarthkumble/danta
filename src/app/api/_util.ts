import { PayPalError } from "@/lib/paypal";

/** Wraps a route so errors become a clear JSON message instead of a stack trace. */
export function handle<A extends unknown[]>(fn: (...a: A) => Promise<unknown>) {
  return async (...a: A) => {
    try {
      const out = await fn(...a);
      return Response.json(out ?? { ok: true });
    } catch (e) {
      const status = e instanceof PayPalError ? 502 : 400;
      console.error(e);
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status });
    }
  };
}
