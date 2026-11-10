import { handle } from "../../_util";
import { env } from "@/lib/env";
import { pp } from "@/lib/paypal";

/** Diagnostics for the sandbox app: which API scopes its token carries, and whether Invoicing answers. Guarded by EVAL_TOKEN. */
export const POST = handle(async (req: Request) => {
  const token = process.env.EVAL_TOKEN;
  if (!token || req.headers.get("x-eval-token") !== token) throw new Error("Not found");
  const res = await fetch(`${env.paypalBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.paypalClientId}:${env.paypalSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const j = (await res.json()) as { scope?: string; app_id?: string };
  const scopes = (j.scope ?? "").split(" ").map((s) => s.replace("https://uri.paypal.com/services/", ""));
  let invoicing: string;
  try {
    await pp("/v2/invoicing/invoices?page=1&page_size=1");
    invoicing = "ok";
  } catch (e) {
    invoicing = String(e);
  }
  return { base: env.paypalBase, appId: j.app_id, invoiceScopes: scopes.filter((s) => /invoic/i.test(s)), scopeCount: scopes.length, invoicing };
});
