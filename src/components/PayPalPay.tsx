"use client";
import { useEffect, useRef, useState } from "react";
import { loadScript } from "@paypal/paypal-js";
import { api } from "./client";

/**
 * PayPal Checkout for one due stage. The server creates the order (amount fixed by the plan, never by the browser)
 * and captures it after approval; a repeated capture is harmless.
 */
export function PayPalPay({ stageId, currency, onPaid }: { stageId: string; currency: string; onPaid: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    if (!clientId) {
      setError("PayPal is not configured on this deployment (NEXT_PUBLIC_PAYPAL_CLIENT_ID).");
      return;
    }
    (async () => {
      try {
        const paypal = await loadScript({ clientId, currency, intent: "capture", components: "buttons" });
        if (cancelled || !paypal?.Buttons || !host.current) return;
        host.current.innerHTML = "";
        await paypal
          .Buttons({
            style: { layout: "vertical", shape: "pill", label: "pay", height: 44 },
            createOrder: async () => {
              setError(null);
              const r = await api<{ orderId: string }>(`/api/stages/${stageId}/order`, {});
              return r.orderId;
            },
            onApprove: async (data) => {
              setBusy(true);
              try {
                await api(`/api/stages/${stageId}/capture`, { orderId: data.orderID });
                onPaid();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            },
            onError: (e) => setError(String((e as { message?: unknown })?.message ?? e)),
          })
          .render(host.current);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stageId, currency, onPaid]);

  return (
    <div>
      <div ref={host} aria-busy={busy} />
      {busy && <p className="small muted">Confirming payment with PayPal…</p>}
      {error && (
        <p className="note warn" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
