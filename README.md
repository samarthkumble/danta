# Danta

**Staged PayPal payments and an aftercare guarantee for people who fly to India for dental care.**

9.6 million US adults have travelled abroad for dental treatment ([CareQuest Institute, 2026](https://carequest.org/press-release/new-report-nearly-9-6-million-adults-have-traveled-outside-the-us-to-receive-dental-treatment/)), and 86% of UK dentists who saw these patients had to treat complications ([British Dental Association](https://bda.org/news-and-opinion/news/dental-tourism-patients-need-to-know-the-risks)). For the Indian diaspora the dentistry is rarely the problem. The money is: patients wire it in advance, read quotes with missing items, and have no way back when a crown cracks after they fly home.

Danta turns a clinic's quote into a checked plan paid in stages with PayPal, and gives the patient a written guarantee their dentist back home can claim against.

Built for the [PayPal AI Hackathon 2026](https://paypalaihackathon.devpost.com/). All clinics, patients and quotes are fictional; all payments use the PayPal sandbox.

**Live demo:** https://danta-inky.vercel.app

## What it does

1. **Reads the quote.** Gemini extracts every line, each linked to the exact text it came from. Code, not the model, then redoes the arithmetic and checks for missing items: a crown with no lab fee, an implant with no abutment, too little healing time between trips, no warranty.
2. **Pay in stages.** A deposit through PayPal Checkout books trip one. Each later stage gets a PayPal invoice only when it is due. Every PayPal write carries an idempotency key, captures are checked against the plan amount, and a stage can only be marked paid once.
3. **An agent with limits.** The clinic's assistant proposes invoices, reschedules and refunds. Rules in code check each proposal (healing gap kept, stage not already paid, refund not more than what is left, inside PayPal's 180-day refund window). A person approves, and the [PayPal Agent Toolkit](https://github.com/paypal/agent-toolkit) executes it.
4. **Aftercare claims.** A home dentist's note is checked by the model against the clinic's written warranty. Code computes the amount, the agent proposes the refund, and the clinic approves it.
5. **The clinic console** shows both trips on a [Bryntum Scheduler Pro](https://bryntum.com/products/schedulerpro/) timeline. The healing time is a dependency with a lag, so the scheduling engine itself will not put trip two before the implant has healed. Dragging a stage asks the assistant to propose the move rather than changing anything directly.
6. **Plain language, in the patient's language.** The plan can be explained in Hindi, Kannada, Malayalam, Tamil and other languages.

## Try the demo

1. Open the live demo and click **Open the live demo**. You get your own copy of a fictional patient's case.
2. Pay the booking deposit with the PayPal sandbox buyer account `sb-88lch53835771@personal.example.com`. The password is in the Devpost submission's testing instructions. It is sandbox money only.
3. Open the **Clinic console**. Try **Bring trip 2 forward to three weeks after trip 1** and watch the healing-gap rule block it. Then ask it to **invoice the next stage that is due** and approve; PayPal sends a real sandbox invoice.
4. Pay that invoice from the patient page (**Pay the PayPal invoice**). PayPal's webhook marks it paid. Repeat for trip 2.
5. Use **Aftercare guarantee → Use a sample note**. The claim is checked against the clinic's warranty, the refund is proposed, and approving it in the clinic console sends the money back through PayPal.

Everything above was tested end to end on the live site on 10 November 2026: deposit, two invoices (one cancelled and reissued after a reschedule), webhook confirmation, a covered claim refunded at 50% of the crown fee, and a sports-injury claim declined.

## Results

`npm run eval` scores quote reading on [20 fictional quotes](eval/quotes.json) in five layouts (dotted price lists, dash lists, tables, letters in prose, rupee notation), each with an answer key. The set was committed before the model ever ran on it. A regex parser is the baseline.

| | Totals right | All issues exactly right | Issue precision | Issue recall |
|---|---|---|---|---|
| Regex baseline | 17/20 | 10/20 | 56% | 88% |
| Danta (Gemini 3.5 Flash-Lite + rules) | 20/20 | 20/20 | 100% | 100% |

Danta got the number of trips wrong on 2 of 20 quotes (one is arguably a fault in the answer key; both are listed). Three of the first 20 model calls failed with a transient error and succeeded on retry. The quotes are synthetic and written by us, so read this as "the model reads varied layouts correctly", not as real-world accuracy. The model's outputs are committed in `eval/cache.json`, so `npm run eval` reproduces the table without an API key.

Full table and every mistake: [eval/results.md](eval/results.md). `npm test` runs 25 tests on the quote checks, the payment schedule and every agent limit.

## How it is built

- Next.js 16, React 19, TypeScript, Supabase Postgres ([schema](supabase/migrations))
- PayPal REST: Orders v2 (capture), Invoicing v2, Payments refunds, verified webhooks
- PayPal Agent Toolkit (`create_invoice`, `send_invoice`, `cancel_sent_invoice`, `create_refund`)
- Vercel AI SDK with Gemini, structured output validated with zod
- Bryntum Scheduler Pro (trial package from npm)

```
src/lib/plan.ts      what the AI extracts, and the deterministic checks
src/lib/cases.ts     plan → deposit and stages with healing gaps
src/lib/payments.ts  orders, captures, invoices, refunds (idempotent)
src/lib/agent.ts     propose → rule check → human approval → Agent Toolkit
src/lib/claims.ts    warranty review and refund proposal
src/components/      patient portal, clinic console, Bryntum timeline
eval/                test quotes, answer key, results
```

## Run it yourself

```bash
npm install
cp .env.example .env.local   # fill in your own sandbox and API keys
npm run dev
```

You need a PayPal sandbox app (Merchant), a Supabase project with the migration applied, and a Gemini API key. Set `PAYPAL_WEBHOOK_ID` after adding a webhook for `INVOICING.INVOICE.PAID` and `PAYMENT.CAPTURE.COMPLETED` pointing at `/api/webhooks/paypal`.

## Limits, honestly

- Danta never gives medical advice. It checks money and schedules, not whether a treatment is right.
- PayPal refunds work for 180 days after payment, so the guarantee covers that window. A real product would route later claims to the clinic.
- Pay Later is not offered: it is not available to merchants in India.
- The quotes in the evaluation are synthetic. Real clinic quotes are messier.

## Business model

Clinics would pay a small fee per completed international case. Patients pay nothing extra beyond PayPal's normal pricing.

## Licence

MIT. See [LICENSE](LICENSE).
