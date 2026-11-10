# Danta: project brief (PayPal AI Hackathon 2026)

**Deadline:** 12 Nov 2026, 12:00 PT = 13 Nov 01:30 IST. Target submit: 12 Nov evening IST.

## Problem (cited)
- 9.6M US adults have travelled abroad for dental care; 58% for lower cost; ~69M lack dental insurance. (CareQuest Institute, Jun 2026)
- It often goes wrong: of UK dentists who saw dental tourists, 86% treated complications; over half say repairs cost patients >£1,000; two-thirds flag poor communication with the overseas dentist; nearly all worry about continuity of care and redress. (British Dental Association survey of 1,000+ dentists)
- India's diaspora already does this: an estimated 18% of NRIs travel home over the holidays and hospitals report dental implants, root canals and cleanings among the most requested treatments. (IANS, Dec 2023)
- Implants need two trips 3 to 6 months apart. Patients wire deposits to clinics they have never seen, with no plan, no record and no recourse.

## Users
- **Patient abroad** (first: NRIs in the US/UK/Gulf; then anyone choosing care abroad).
- **Clinic coordinator** at an Indian dental clinic that treats international patients.

## Solution
1. AI reads the clinic's quote and builds a plain-language, itemised plan; flags missing or inconsistent items (arithmetic is recomputed in code). Bilingual view.
2. Bryntum Scheduler Pro timeline of both trips, the healing gap and every payment milestone; coordinator view of chairs and dentists. Moving a date keeps clinical gaps and re-plans payments.
3. PayPal moves money in stages: deposit through Checkout (Orders v2), each later stage invoiced when reached (Invoicing v2), verified webhooks, idempotent requests, partial refunds.
4. Agentic: an agent built on the PayPal Agent Toolkit creates orders, issues and sends invoices and drafts refunds, inside coded spend limits and with one human approval per money movement.
5. 6-month aftercare guarantee: a home dentist's note is checked by AI against the clinic's warranty terms and proposes a partial PayPal refund (PayPal allows refunds within 180 days of capture), which the clinic approves.

## Demo moment
A patient in New Jersey pastes a Mangaluru clinic's quote. Danta finds the lab fee is missing, shows both trips on a timeline, takes a $300 deposit through PayPal. The clinic moves trip 2; the timeline holds the healing gap and the agent re-issues the invoice. Three months later a home dentist reports a loose crown; Danta proposes a $180 refund and PayPal sends it.

## Prizes targeted
Most Impactful, Best Use of PayPal + AI (and Grand); Best Use of Agentic Commerce (agent executes PayPal actions); sponsor: Bryntum (host on Render as backup if time).

## Evaluation plan
20 synthetic clinic quotes (marked fictional) with an answer key: line items, totals, stages, planted issues. Measure AI extraction and issue detection against a rule-based baseline. Payment safety tests: never pays twice (PayPal-Request-Id), forged webhook rejected, refund never exceeds remaining balance.

## Risks and cuts
- PayPal coverage excludes some medical-tourism markets: focus on US/UK/Gulf/diaspora.
- Pay Later cross-border needs PayPal approval: "where eligible" only.
- No medical advice: AI explains the clinic's own quote, logistics and money only.
- Cut order if late: AG Grid, voice, extra languages, coordinator analytics.
