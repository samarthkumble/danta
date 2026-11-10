"use client";
import { useCallback, useEffect, useState } from "react";
import type { Case, Clinic, Stage } from "@/lib/cases";

export type Action = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
  status: "proposed" | "blocked" | "approved" | "executed" | "rejected" | "failed";
  limit_check: { ok: boolean; rules: { rule: string; pass: boolean }[] } | null;
  result: unknown;
  created_at: string;
};
export type Claim = {
  id: string;
  stage_id: string;
  note: string;
  verdict: { covered: boolean; matchedTerm: string | null; refundPercent: number; reasoning: string; needsHuman: boolean; daysSincePayment?: number } | null;
  refund_cents: number;
  status: string;
  created_at: string;
};
export type Evt = { id: number; actor: string; kind: string; detail: Record<string, unknown>; created_at: string };
export type Bundle = { case: Case & { demo?: boolean }; stages: Stage[]; clinic: Clinic; actions: Action[]; claims: Claim[]; events: Evt[]; resources: { id: string; name: string; kind: string }[] };

export const fmt = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(cents / 100);

export const day = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "to be set";

export const PAID = ["paid", "partially_refunded", "refunded"];

export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
  return j;
}

/** Loads a case by id (clinic) or public token (patient) and keeps it fresh. */
export function useCase(key: string, pollMs = 0) {
  const [data, setData] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await api<Bundle>(`/api/cases/${encodeURIComponent(key)}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [key]);
  useEffect(() => {
    void reload();
    if (!pollMs) return;
    const t = setInterval(() => void reload(), pollMs);
    return () => clearInterval(t);
  }, [reload, pollMs]);
  return { data, error, reload };
}

export function stageLabel(s: Stage) {
  if (s.status === "partially_refunded") return "Paid, part refunded";
  if (s.status === "refunded") return "Refunded";
  if (s.status === "paid") return "Paid";
  if (s.status === "invoiced") return "Invoice sent";
  if (s.status === "due") return "Due now";
  return "Later";
}

export function stageClass(s: Stage) {
  if (s.status === "partially_refunded" || s.status === "refunded") return "refund";
  return s.status;
}
