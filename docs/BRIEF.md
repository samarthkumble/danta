# Danta: project brief (PayPal AI Hackathon 2026)

Deadline: 12 Nov 2026, 12:00 PM PT = 1:30 AM IST Fri 13 Nov. Target submit: Thu 12 Nov evening IST.

## Problem (with evidence)
- 9.6 million US adults have travelled abroad for dental care; 58% cite lower cost. 69 million lack dental insurance. (CareQuest Institute, June 2026)
- It often goes wrong after the trip: of UK dentists who saw dental tourists, 86% treated complications; over half said repairs cost patients more than GBP 1,000; two-thirds flagged communication with the overseas dentist; nearly all worried about continuity of care and redress. (British Dental Association)
- India's 35.4 million-strong diaspora already comes home for treatment: a Toronto patient quoted CAD 2,500 for a crown paid CAD 1,500 for the whole trip including treatment (The Quint, Jan 2024); NRIs crowd Indian hospitals in the holiday season (IANS, Dec 2023).
- Implants usually need two trips months apart (placement, 3 to 6 months of healing, then the crown). Today patients wire large deposits to a clinic they have never seen, with no clear plan, record or recourse.

## Users
- Patient abroad (NRI first, any international patient): wants a clear plan, fair staged payments, and protection if something goes wrong.
- Clinic coordinator in India: wants committed patients (deposits), fewer no-shows, simple cross-border collection, and trust/reviews.

## Solution
1. AI reads the clinic's treatment quote (PDF/text) -> structured plan: stages, line items, totals recomputed in code, missing items flagged, every field linked to its source text; bilingual explanation.
2. Bryntum timeline: both trips, healing gap, appointments, payment milestones. AI reschedules within clinical rules (crown not before healing ends) and updates what is owed.
3. PayPal money in stages: deposit via PayPal Checkout (Orders v2), each stage invoiced only when reached (Invoicing v2), verified webhooks, idempotent requests.
4. Aftercare guarantee: clinic-set warranty; home dentist's report -> AI checks it against the warranty terms -> proposes a PayPal refund on the captured stage (within PayPal's 180-day refund window); clinic approves with one click.
5. Agentic commerce: PayPal Agent Toolkit (v1.11) executes the money actions (create_order, pay_order, create_invoice, send_invoice, create_refund) inside coded limits and approval gates.

## Why it can win
- Innovation: no entry in this domain found among public repos for this hackathon (escrow, freelancer, agent-wallet, voice, relief, farmer, Bryntum-milestone clusters are each crowded).
- Impact: cited demand and cited harm; continuity of care and redress are exactly what dentists' bodies warn about.
- Tech: Orders, Invoicing, Refunds, verified webhooks, idempotency, Agent Toolkit; AI does extraction with source links, rule-bound rescheduling, warranty review.
- Design: two-sided product (patient portal + clinic scheduler).
- Presentation: human story + our video workflow.
- Winner patterns: payment is the product; AI acts on money; specific user; cited harm.

## Target prizes
- Main: Most Impactful; Best Use of PayPal + AI (also Grand, Most Creative, Best Demo Delivery, Agentic Commerce).
- Sponsor: Bryntum (timeline is core). Host on Render as backup eligibility. AG Grid only if ahead of schedule.

## Demo moment
Patient uploads a clinic quote -> AI plan with a flagged missing lab fee -> pays deposit with PayPal -> timeline shows trip 1, healing, trip 2 -> the crown date slips -> agent reschedules, recalculates, sends the stage invoice -> home dentist reports a loose crown -> AI matches warranty clause -> clinic approves -> PayPal refund lands.

## Evaluation plan
- 20 fictional clinic quotes (varied layouts, some non-English, planted issues) with an answer key, committed before running.
- Measure: line-item extraction accuracy, total-mismatch detection, missing-item detection; baseline = regex/rules extractor.
- Warranty: 10 fictional claims (in/out of terms) vs answer key.
- Payment safety: test that duplicate webhooks/retries never double-charge or double-refund.

## Honest limits (stated in the submission)
- Pay Later not offered: PayPal Pay Later requires merchants in US/UK/CA/AU/some EU countries; India not listed.
- PayPal refunds only within 180 days of capture: guarantee window is 6 months; later claims become clinic-approved payouts.
- Not medical advice; AI only explains the clinic's own quote and logistics. All patient data is synthetic.
- Some medical-tourism source markets are not served by PayPal; focus on diaspora and Western/Gulf patients.

## Stack
- TypeScript monorepo: Vite + React frontend, Node (Hono) API; one Render web service (and Vercel preview for testing).
- PayPal REST (sandbox) + @paypal/agent-toolkit (ai-sdk) + Vercel AI SDK with Gemini.
- Bryntum Scheduler Pro / Gantt trial packages from public npm (@bryntum/*-trial 7.3.8).
- SQLite (better-sqlite3) or JSON store for the demo; seeded demo mode.

## Build order and cuts
1. Core end to end on one example (mock AI allowed at first).
2. Evaluation + payment safety.
3. Bryntum timeline + clinic scheduler; Agent Toolkit; bilingual.
4. Demo mode, deploy, README, video, Devpost.
Cut first if behind: AG Grid, voice, extra languages, clinic multi-chair view.

## Sources
- https://carequest.org/press-release/new-report-nearly-9-6-million-adults-have-traveled-outside-the-us-to-receive-dental-treatment/
- https://bda.org/news-and-opinion/news/dental-tourism-patients-need-to-know-the-risks
- https://www.thequint.com/fit/medical-tourism-nris-medical-dental-procedures-india
- https://ianslive.in/nris-flock-to-hospitals-in-india-during-holiday-season--20231230110006
- https://www.wam.ae/en/article/15hsmel-indian-diaspora-ranks-world%E2%80%99s-biggest-354-million
- https://docs.paypal.ai/payments/methods/paypal/refund
- https://developer.paypal.com/pay-later/overview
- https://bryntum.com/blog/hackathon-paypal-and-bryntum/
- https://paypalaihackathon.devpost.com/rules
