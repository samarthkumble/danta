"use client";
import { useEffect, useMemo, useRef } from "react";
import { BryntumSchedulerPro } from "@bryntum/schedulerpro-react";
import "@bryntum/schedulerpro/schedulerpro.css";
import "@bryntum/schedulerpro/svalbard-light.css";
import "@bryntum/schedulerpro/fontawesome/css/fontawesome.css";
import "@bryntum/schedulerpro/fontawesome/css/solid.css";
import type { Bundle } from "./client";
import { PAID, fmt } from "./client";

const DAY = 86_400_000;
const d = (iso: string) => new Date(`${iso}T00:00:00`);
const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Both trips on a Bryntum Scheduler Pro timeline. Healing time is a dependency with a lag, so the
 * scheduling engine itself refuses to put trip 2 before the implant has healed. Dragging a stage
 * does not move anything: it asks the clinic assistant to propose the change, which a person approves.
 */
export default function Schedule({ b, onMove }: { b: Bundle; onMove: (stageIdx: number, newStart: string) => void }) {
  const ref = useRef<BryntumSchedulerPro>(null);
  const cur = b.case.totals?.currency ?? "USD";

  const data = useMemo(() => {
    const dentists = b.resources.filter((r) => r.kind === "dentist");
    const trips = [...new Set(b.stages.filter((s) => s.idx > 0).map((s) => s.trip))].sort();
    const who = (trip: number) => dentists[Math.min(trips.indexOf(trip), dentists.length - 1)]?.id ?? "clinic";
    const resources = [
      { id: "payments", name: "PayPal payments", iconCls: "fa fa-credit-card" },
      ...(dentists.length ? dentists.map((r) => ({ id: r.id, name: r.name, iconCls: "fa fa-user-doctor" })) : [{ id: "clinic", name: b.clinic.name }]),
      { id: "home", name: `${b.case.patient_name} at home`, iconCls: "fa fa-house" },
    ];
    const treat = b.stages.filter((s) => s.idx > 0 && s.starts_on && s.ends_on);
    const events: object[] = [];
    const dependencies: object[] = [];
    for (const s of b.stages) {
      if (!s.starts_on || !s.ends_on) continue;
      const paid = PAID.includes(s.status);
      const cls = `danta-${s.status === "partially_refunded" || s.status === "refunded" ? "paid" : s.status}`;
      if (s.idx === 0) {
        events.push({ id: s.id, name: `Deposit ${fmt(s.amount_cents, s.currency)}`, startDate: d(s.starts_on), duration: 0, durationUnit: "day", resourceId: "payments", cls, draggable: false, resizable: false, stageIdx: 0, amount: s.amount_cents });
        continue;
      }
      events.push({
        id: s.id,
        name: s.title,
        startDate: d(s.starts_on),
        endDate: new Date(d(s.ends_on).getTime() + DAY),
        resourceId: who(s.trip),
        cls,
        draggable: !paid,
        resizable: false,
        stageIdx: s.idx,
        amount: s.amount_cents,
        status: s.status,
        label: `${s.title}, ${fmt(s.amount_cents, s.currency)}`,
      });
    }
    for (let i = 1; i < treat.length; i++) {
      const prev = treat[i - 1];
      const next = treat[i];
      dependencies.push({ id: `dep-${next.id}`, from: prev.id, to: next.id, type: 2, lag: next.min_gap_days, lagUnit: "day" });
      if (next.trip !== prev.trip && next.min_gap_days > 0) {
        events.push({
          id: `heal-${next.id}`,
          name: `Healing, at least ${next.min_gap_days} days`,
          startDate: new Date(d(prev.ends_on!).getTime() + DAY),
          endDate: d(next.starts_on!),
          resourceId: "home",
          cls: "danta-other",
          draggable: false,
          resizable: false,
          manuallyScheduled: true,
        });
      }
    }
    const firstPaid = b.stages.filter((s) => s.paid_at).map((s) => new Date(s.paid_at!).getTime()).sort()[0];
    const timeRanges = [
      { id: "today", name: "Today", startDate: new Date(new Date().setHours(0, 0, 0, 0)) },
      ...(firstPaid ? [{ id: "refund", name: "PayPal refund window for the first payment ends", startDate: new Date(firstPaid + 180 * DAY) }] : []),
    ];
    const starts = b.stages.filter((s) => s.starts_on).map((s) => d(s.starts_on!).getTime());
    const ends = b.stages.filter((s) => s.ends_on).map((s) => d(s.ends_on!).getTime());
    return {
      resources,
      events,
      dependencies,
      timeRanges,
      start: new Date(Math.min(Date.now(), ...starts) - 10 * DAY),
      end: new Date(Math.max(...ends, Date.now()) + 30 * DAY),
    };
  }, [b]);

  // Loaded only in the browser (no server rendering), so window is available here.
  const narrow = window.innerWidth < 640;
  const version = b.stages.map((s) => `${s.id}:${s.starts_on}:${s.status}`).join("|");

  // Fit both trips and the healing months into view once the engine has placed the events.
  useEffect(() => {
    const t = setTimeout(() => void ref.current?.instance?.zoomToFit({ leftMargin: 30, rightMargin: narrow ? 90 : 190 }), 400);
    return () => clearTimeout(t);
  }, [version, narrow]);

  return (
    <div className="sched-host">
      <BryntumSchedulerPro
        key={version}
        ref={ref}
        startDate={data.start}
        endDate={data.end}
        viewPreset="monthAndYear"
        rowHeight={52}
        barMargin={8}
        eventStyle="rounded"
        columns={[{ type: "resourceInfo", text: "Who", width: narrow ? 120 : 220, showEventCount: false, showImage: false }]}
        resources={data.resources}
        events={data.events}
        dependencies={data.dependencies}
        timeRanges={data.timeRanges}
        timeRangesFeature={{ showCurrentTimeLine: false, showHeaderElements: true }}
        dependenciesFeature={{ allowCreate: false }}
        eventEditFeature={false}
        eventMenuFeature={false}
        scheduleMenuFeature={false}
        cellMenuFeature={false}
        eventDragCreateFeature={false}
        eventResizeFeature={false}
        eventDragFeature={{ constrainDragToResource: true, showExactDropPosition: true }}
        eventTooltipFeature={{
          template: ({ eventRecord }: { eventRecord: { name: string; startDate: Date; endDate: Date; getData: (k: string) => unknown } }) => {
            const amount = eventRecord.getData("amount") as number | undefined;
            return `<b>${esc(eventRecord.name)}</b><br>${eventRecord.startDate.toDateString()}${amount !== undefined ? `<br>${esc(fmt(amount, cur))}` : ""}`;
          },
        }}
        labelsFeature={{ after: { field: "label" } }}
        eventRenderer={({ eventRecord }: { eventRecord: { name: string; getData: (k: string) => unknown } }) =>
          // Treatment stages are only a few days wide, so their name sits beside the bar instead of inside it.
          eventRecord.getData("label") ? "" : esc(eventRecord.name)
        }
        onAfterEventDrop={({ eventRecords, valid }) => {
          const r = eventRecords[0];
          const idx = r?.getData("stageIdx") as number | undefined;
          if (!valid || !r || !idx) return;
          onMove(idx, iso(new Date(r.startDate)));
        }}
      />
    </div>
  );
}
