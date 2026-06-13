# Plan 3 — sequencing

Plan 3 of 3. Orders [Plan 1](./plan-current-pipeline.md) (W*) and
[Plan 2](./plan-new-data-sources.md) (S*) by dependency, with decision gates. Rationale in
[`rule-text-efficacy.md`](./rule-text-efficacy.md).

**Sequencing logic.** Phase 0 (audit) is cheap and gates all of Plan 2 — do it first and in
parallel with early Plan 1 work. Plan 1 is mostly unblocked today and delivers UI value on
its own, so it front-loads; its RIN/linkage output (W1→W4→`fr_docket_links`) is the
substrate Plan 2 can't start without. Plan 2 then proceeds **pilot-first** (small anchor
cohort) behind a go/no-go, scaling only after a successful read.

---

## Dependency graph (text)

```
Phase 0  audit ───────────────────────────────────► [GATE A] ──► Plan 2 eligible
                                                          ▲
W1 field recovery ─► W4 chains ─► fr_docket_links ────────┘
   │                    │
   │                    └─► W5 docket_signals (with W2)
   └─► W6 inert-feature activations
W2 comment precompute ─┬─► W3 cluster/stance rollups ─► W6 faster surfaces
W3 agency rollups ─────┘

Plan 2 (after GATE A):
S1 rule_versions ─► S2 rule_diffs ─┬─► S4 uptake (needs S3 quotable)
                                   ├─► S2 numeric deltas ─► S4 resolution
S1 preamble ─► S4 acknowledgment ─► [GATE B pilot read] ──► scale-out + S6 UI
S5 attachments (after Phase 0; value needs W1 org) ─────────► S4 on org comments
```

---

## Phases

### Phase 0 — Audit (gates everything in Plan 2)
Run the §7 queries + spot checks: cohort size, multi-NPRM ambiguity rate, FR linkage
coverage, attachment burden/format mix, **instructions-only share of finals** (§8.2),
scanned-PDF share, and whether `downloads.regulations.gov` is quota-free. Cheap; start
immediately, parallel with Phase A.

> **GATE A (go/no-go):** cohort ≥ a few hundred dockets · FR linkage ≥ ~80% of cohort
> (else do W1 RIN/frDocNum first and re-measure) · section alignment works on spot checks.

### Phase A — Plan 1 foundation (front-loaded, mostly parallel)
- **A1 = W1** field recovery. Order *within*: **RIN first** (highest leverage), then
  frDocNum, organization/category, then withdrawn/attachments/subtype/first-last name.
- **A2 = W4** rulemaking chains + `fr_docket_links` — needs A1 RIN.
- **A3 = W2** comment precompute — independent of A1, runs in parallel.
- **A4 = W3** rollups (agency/discovery/cluster) — largely independent, parallel.

These have no new egress and can ship continuously. A2's output is the Plan 2 unblock.

### Phase B — Plan 1 payoff (interface + today's analytics)
- **B1 = W6** activations — needs A1 columns.
- **B2 = W5** `docket_signals` correlations + dashboard — needs A1+A3+A2.
- **B3 = W6** docket chain view (metadata shell for the later diff tab) — needs A2.

Phase B can overlap Phase C; it's the "value while Plan 2 incubates" track.

### Phase C — Plan 2 pilot (gated, ~50–100 anchor dockets)
Cohort = the two lab demo dockets (HUD-2026-0529 organic, ATF-2023-0002 orchestrated) +
documented-record rulemakings as validation anchors (§8.9), stratified by agency/volume/era.
- **C0 = S3** `quotable` representation (tiny, do early).
- **C1 = S1** rule-text acquisition (FR XML + eCFR) — needs A2 chains/links + GATE A.
- **C2 = S2** section diff + numeric deltas — needs C1.
- **C3 = S4 acknowledgment** + self-count calibration + hand-labeled gold set (~20 dockets
  for precision) — needs C1 preamble.

> **GATE B (pilot read):** acknowledgment precision acceptable on the gold set · diffs align
> on anchors · numeric deltas match known outcomes directionally. Only then scale.

### Phase D — Plan 2 scale & deeper metrics (after GATE B)
- **D1 = S4 uptake** — needs C2 diffs + C0 quotable + IDF stoplist.
- **D2 = S5 attachments** — can *start* after Phase 0, but the org split needs A1
  organization; dedup (§8.5) before any OCR. Feeds S4 on organizational comments.
- **D3 = S4 issue resolution** — numeric precursor from C2, then LLM for non-numeric;
  needs D2 for org asks. Pilot-bounded until proven.
- **D4** = full diff/efficacy scale-out across cohort + **S6** UI ("What changed" tab,
  efficacy chips, component metrics with quality flags).

---

## Ordering at a glance

| # | Item | Plan | Needs | New egress? | Gate |
|---|---|---|---|---|---|
| 0 | Audit | — | — | read-only | opens GATE A |
| A1 | Field recovery (RIN→…) | 1·W1 | — | no | — |
| A2 | Chains + fr_docket_links | 1·W4 | A1 RIN | no | — |
| A3 | Comment precompute | 1·W2 | — | no | — |
| A4 | Rollups | 1·W3 | — | no | — |
| B1 | UI activations | 1·W6 | A1 | no | — |
| B2 | docket_signals | 1·W5 | A1·A2·A3 | no | — |
| B3 | Chain view | 1·W6 | A2 | no | — |
| C0 | quotable rep | 2·S3 | — | no | — |
| C1 | rule_versions | 2·S1 | A2 | **FR/eCFR** | GATE A |
| C2 | rule_diffs + numeric | 2·S2 | C1 | no | — |
| C3 | acknowledgment | 2·S4 | C1 | LLM | feeds GATE B |
| D1 | uptake | 2·S4 | C2·C0 | no | GATE B |
| D2 | attachments | 2·S5 | Phase 0·A1 | **downloads** | (post-0) |
| D3 | issue resolution | 2·S4 | C2·D2 | LLM | GATE B |
| D4 | scale-out + UI | 2·S6 | C2·D1 | FR/eCFR | GATE B |

---

## Recommended critical path

`Audit → W1(RIN) → W4/fr_docket_links → [GATE A] → S1 → S2 → S4 acknowledgment → [GATE B]
→ uptake + attachments + scale-out`.

Run the **Plan 1 UI track (A3/A4 → B1/B3) in parallel** — it has no dependency on the audit
or on new sources, so it delivers visible improvement and de-risks the rollup/edge-cache
architecture while the acquisition pilot is still gated. Defer the LLM-heavy resolution
metric (D3) and full attachment OCR (D2 scale) until the cheap, deterministic signals
(numeric deltas, acknowledgment, uptake) have proven the pipeline on the anchor cohort.
