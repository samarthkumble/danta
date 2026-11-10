/**
 * Scores Danta's quote reading against eval/quotes.json (20 fictional quotes with an answer key)
 * and against a regex baseline. Run: npm run eval   (needs GEMINI_API_KEY; without it only the baseline runs)
 * Model outputs are cached in eval/cache.json, keyed by model and prompt version, so reruns are reproducible.
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { checkPlan, mergeIssues, type Issue, type Plan } from "../src/lib/plan";

type Key = { totalCents: number; statedTotalCents: number | null; trips: number; items: number; currency: string; issues: string[] };
type Q = { id: string; note: string; quote: string; key: Key };
type Run = { totalCents: number | null; trips: number | null; items: number | null; currency: string | null; issues: string[]; aiFlags?: number; error?: string };

const TAGS = ["line_math", "total_mismatch", "implant_no_crown", "no_abutment", "no_lab_fee", "no_warranty", "short_gap"];
const quotes: Q[] = JSON.parse(fs.readFileSync("eval/quotes.json", "utf8"));

/** Tags come only from the deterministic rules' messages, so the AI never grades itself. */
function tagsFromIssues(issues: Issue[]) {
  const t = new Set<string>();
  for (const i of issues.filter((x) => x.by === "code")) {
    if (/should be .* but the quote says/.test(i.message)) t.add("line_math");
    if (/add up to .* total says/.test(i.message)) t.add("total_mismatch");
    if (/implant but no crown/.test(i.message)) t.add("implant_no_crown");
    if (/No abutment/.test(i.message)) t.add("no_abutment");
    if (/No lab fee/.test(i.message)) t.add("no_lab_fee");
    if (/gives no warranty/.test(i.message)) t.add("no_warranty");
    if (/healing days/.test(i.message)) t.add("short_gap");
  }
  return [...t].sort();
}

// ---------------------------------------------------------------- baseline: what a careful regex parser gets
const num = (s: string) => Number(s.replace(/,/g, ""));
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
function baseline(text: string): Run {
  const lines = text.split("\n");
  let total = 0, items = 0, stated: number | null = null, mathBad = false;
  const amt = /([\d][\d,]*(?:\.\d+)?)(?:\/-)?\s*\|?\s*$/;
  for (const l of lines) {
    if (/total|altogether/i.test(l)) {
      const m = l.match(/([\d][\d,]*(?:\.\d+)?)/g);
      if (m) stated = Math.round(num(m[m.length - 1]) * 100);
      continue;
    }
    if (/deposit|advance|warranty|guarantee|qty \| rate/i.test(l)) continue;
    // Headings such as "TRIP 1 (6 days)" or "Sitting 2" end in a number but are not prices.
    if (/^\s*(trip|visit|sitting|phase|stage)\b/i.test(l) && !/[=@:|]/.test(l.replace(/:\s*$/, ""))) continue;
    const m = l.match(amt);
    if (!m || !/[a-z]/i.test(l)) continue;
    items++;
    total += Math.round(num(m[1]) * 100);
    const qx = l.match(/(\d+)\s*(?:x|no\. @)\s*(?:rs\.\s*)?([\d,]+(?:\.\d+)?)/i);
    if (qx && Math.abs(num(qx[1]) * num(qx[2]) * 100 - num(m[1]) * 100) > 1) mathBad = true;
  }
  const low = text.toLowerCase();
  const tags = new Set<string>();
  if (mathBad) tags.add("line_math");
  if (stated !== null && Math.abs(stated - total) > 1) tags.add("total_mismatch");
  const implant = /implant/.test(low);
  if (implant && !/crown|bridge|denture|prosthe/.test(low)) tags.add("implant_no_crown");
  if (implant && !/abutment/.test(low)) tags.add("no_abutment");
  if (/crown|bridge|veneer/.test(low) && !/\blab/.test(low)) tags.add("no_lab_fee");
  if (!/warrant|guarantee/.test(low)) tags.add("no_warranty");
  const g = low.match(/(\d+|one|two|three|four|five|six)\s+(week|month|day)s?/);
  if (implant && g) {
    const n = WORDS[g[1]] ?? Number(g[1]);
    const days = n * (g[2] === "week" ? 7 : g[2] === "month" ? 30 : 1);
    if (days < 60) tags.add("short_gap");
  }
  const trips = lines.filter((l) => /^(trip|visit|sitting|phase|stage|first|second|on your|\w+ visit)/i.test(l.trim()) && !/\|/.test(l)).length || null;
  const cur = text.match(/\b(USD|GBP|CAD|AUD|INR|AED)\b/)?.[1] ?? null;
  return { totalCents: items ? total : null, trips, items, currency: cur, issues: [...tags].sort() };
}

// ---------------------------------------------------------------- Danta
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const PROMPT_VERSION = createHash("sha256").update(fs.readFileSync("src/lib/ai.ts", "utf8") + fs.readFileSync("src/lib/plan.ts", "utf8")).digest("hex").slice(0, 10);
const CACHE = "eval/cache.json";
const cache: Record<string, Plan> = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

async function danta(q: Q): Promise<Run> {
  const ck = `${MODEL}:${PROMPT_VERSION}:${q.id}`;
  let plan = cache[ck];
  if (!plan) {
    const { extractPlan } = await import("../src/lib/ai");
    plan = await extractPlan(q.quote);
    cache[ck] = plan;
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  }
  const r = checkPlan(plan);
  const issues = mergeIssues(plan, r.issues);
  return { totalCents: r.totalCents, trips: new Set(plan.stages.map((s) => s.trip)).size, items: plan.items.length, currency: plan.currency, issues: tagsFromIssues(issues), aiFlags: plan.flags.length };
}

// ---------------------------------------------------------------- scoring
function score(name: string, runs: Run[]) {
  const per: Record<string, { tp: number; fp: number; fn: number }> = Object.fromEntries(TAGS.map((t) => [t, { tp: 0, fp: 0, fn: 0 }]));
  let total = 0, trips = 0, items = 0, cur = 0, exact = 0;
  runs.forEach((r, i) => {
    const k = quotes[i].key;
    if (r.totalCents === k.totalCents) total++;
    if (r.trips === k.trips) trips++;
    if (r.items === k.items) items++;
    if (r.currency === k.currency) cur++;
    if (JSON.stringify(r.issues) === JSON.stringify(k.issues)) exact++;
    for (const t of TAGS) {
      const want = k.issues.includes(t), got = r.issues.includes(t);
      if (want && got) per[t].tp++;
      else if (got) per[t].fp++;
      else if (want) per[t].fn++;
    }
  });
  const tp = Object.values(per).reduce((a, x) => a + x.tp, 0), fp = Object.values(per).reduce((a, x) => a + x.fp, 0), fn = Object.values(per).reduce((a, x) => a + x.fn, 0);
  return { name, n: runs.length, total, trips, items, currency: cur, exact, precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, tp + fn), per };
}

async function main() {
  const base = quotes.map((q) => baseline(q.quote));
  const results = [score("Regex baseline", base)];
  let dantaRuns: Run[] | null = null;
  if (process.env.GEMINI_API_KEY) {
    dantaRuns = [];
    for (const q of quotes) {
      try {
        dantaRuns.push(await danta(q));
      } catch (e) {
        dantaRuns.push({ totalCents: null, trips: null, items: null, currency: null, issues: [], error: String(e) });
      }
      process.stdout.write(".");
    }
    console.log();
    results.push(score(`Danta (${MODEL})`, dantaRuns));
  } else console.log("GEMINI_API_KEY not set: running the baseline only.");

  const pct = (a: number, n: number) => `${a}/${n}`;
  const md = [
    `# Quote-reading evaluation`,
    ``,
    `20 fictional quotes in five layouts (dotted lines, dash lists, pipe tables, prose, rupee notation), answer key in \`eval/quotes.json\`.`,
    `Prompt version \`${PROMPT_VERSION}\`, run ${new Date().toISOString().slice(0, 10)}. Issue tags for Danta come only from the rules in code.`,
    ``,
    `| | Totals right | Trips right | Line items right | Currency right | All issues exactly right | Issue precision | Issue recall |`,
    `|---|---|---|---|---|---|---|---|`,
    ...results.map((r) => `| ${r.name} | ${pct(r.total, r.n)} | ${pct(r.trips, r.n)} | ${pct(r.items, r.n)} | ${pct(r.currency, r.n)} | ${pct(r.exact, r.n)} | ${(r.precision * 100).toFixed(0)}% | ${(r.recall * 100).toFixed(0)}% |`),
    ``,
    `## Per issue (true positives / false positives / missed)`,
    ``,
    `| Issue | ${results.map((r) => r.name).join(" | ")} |`,
    `|---|${results.map(() => "---").join("|")}|`,
    ...TAGS.map((t) => `| ${t} | ${results.map((r) => `${r.per[t].tp} / ${r.per[t].fp} / ${r.per[t].fn}`).join(" | ")} |`),
    ``,
    `## Mistakes`,
    ``,
    ...quotes.flatMap((q, i) => {
      const rows: string[] = [];
      for (const [name, runs] of [["Baseline", base], ["Danta", dantaRuns]] as const) {
        if (!runs) continue;
        const r = runs[i];
        const errs: string[] = [];
        if (r.error) errs.push(`error: ${r.error.slice(0, 120)}`);
        if (r.totalCents !== q.key.totalCents) errs.push(`total ${r.totalCents} vs ${q.key.totalCents}`);
        const miss = q.key.issues.filter((t) => !r.issues.includes(t)), extra = r.issues.filter((t) => !q.key.issues.includes(t));
        if (miss.length) errs.push(`missed ${miss.join(", ")}`);
        if (extra.length) errs.push(`wrongly flagged ${extra.join(", ")}`);
        if (errs.length) rows.push(`- ${q.id} (${q.note}), ${name}: ${errs.join("; ")}`);
      }
      return rows;
    }),
  ].join("\n");
  fs.writeFileSync("eval/results.md", md + "\n");
  fs.writeFileSync("eval/results.json", JSON.stringify({ promptVersion: PROMPT_VERSION, model: MODEL, results, runs: { baseline: base, danta: dantaRuns } }, null, 1));
  console.log(md);
}

void main();
