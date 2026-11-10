# Quote-reading evaluation

20 fictional quotes in five layouts (dotted lines, dash lists, pipe tables, prose, rupee notation), answer key in `eval/quotes.json`.
Prompt version `cd5cb67656`, run 2026-11-10. Issue tags for Danta come only from the rules in code.

Caveats: the quotes are synthetic and were written by the same team that wrote the rules, so this measures whether the model reads varied layouts correctly, not real-world accuracy. Model outputs are in `eval/cache.json`; rerunning `npm run eval` reproduces these numbers without calling the model.

| | Totals right | Trips right | Line items right | Currency right | All issues exactly right | Issue precision | Issue recall |
|---|---|---|---|---|---|---|---|
| Regex baseline | 17/20 | 19/20 | 17/20 | 20/20 | 10/20 | 56% | 88% |
| Danta (gemini-3.5-flash-lite) | 20/20 | 18/20 | 20/20 | 20/20 | 20/20 | 100% | 100% |

## Per issue (true positives / false positives / missed)

| Issue | Regex baseline | Danta (gemini-3.5-flash-lite) |
|---|---|---|
| line_math | 1 / 0 / 1 | 2 / 0 / 0 |
| total_mismatch | 2 / 3 / 0 | 2 / 0 / 0 |
| implant_no_crown | 0 / 0 / 1 | 1 / 0 / 0 |
| no_abutment | 2 / 4 / 0 | 2 / 0 / 0 |
| no_lab_fee | 5 / 2 / 0 | 5 / 0 / 0 |
| no_warranty | 3 / 2 / 0 | 3 / 0 / 0 |
| short_gap | 2 / 1 / 0 | 2 / 0 / 0 |

## Mistakes

Every miss is listed, including ones where the answer key itself is debatable. The key was not changed after seeing results.

- q01 (clean), Baseline: wrongly flagged short_gap
- q02 (crown without lab fee), Baseline: wrongly flagged no_abutment
- q04 (short healing gap), Baseline: 3 trips vs 2
- q05 (veneers without lab fee), Baseline: wrongly flagged no_abutment
- q08 (line math wrong (3x35=105)), Baseline: wrongly flagged no_abutment, no_lab_fee
- q09 (clean, prose), Baseline: total null vs 209000; 0 line items vs 4; wrongly flagged total_mismatch
- q10 (implant with no crown or abutment, single trip), Baseline: total null vs 77000; 0 line items vs 2; missed implant_no_crown; wrongly flagged no_lab_fee, total_mismatch
- q11 (clean, rupees, no implant), Baseline: wrongly flagged no_abutment
- q11 (clean, rupees, no implant), Danta: 1 trips vs 2
- q17 (line math wrong (2x90=180)), Baseline: missed line_math; wrongly flagged no_warranty
- q18 (clean prose), Baseline: total null vs 96000; 0 line items vs 4; wrongly flagged total_mismatch
- q19 (total off by 50), Baseline: wrongly flagged no_warranty
- q20 (implant, abutment and crown in one sitting, no lab), Danta: 2 trips vs 1
