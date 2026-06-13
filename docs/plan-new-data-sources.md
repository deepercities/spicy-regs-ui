# Plan 2 — additions requiring new data sources

Plan 2 of 3, derived from [`rule-text-efficacy.md`](./rule-text-efficacy.md). Companion
docs: [Plan 1 — current pipeline](./plan-current-pipeline.md),
[Plan 3 — sequencing](./plan-sequencing.md).

**Scope.** Everything that cannot be computed from the corpus as mirrored today because it
needs content the pipeline has never fetched. Three new acquisition pipelines and the
metrics they unlock. **Hard dependency on Plan 1**: the linkage (`fr_docket_links`, RIN
`rulemaking_chains`) and precompute (`skeleton_hash`, stance) are the substrate every
workstream here builds on. Everything heavy is offline-tier; the browser only ever reads
small baked artifacts.

---

## S0 — The three new sources

| Source | What it provides | Access | Constraint |
|---|---|---|---|
| **Federal Register full-text XML** | clean, structured rule text — preamble (`<SUPLINF>`) vs. regulatory text (`<REGTEXT>`/`<SECTNO>`/`<AMDPAR>`) separately tagged | `full_text_xml_url` from `/api/v1/documents/{document_number}.json` (one call/doc); govinfo FR bulk XML for backfill | per-doc fetch; keyed by `document_number` (have it in `federal_register.parquet`) |
| **eCFR point-in-time XML** | exact codified CFR text at any date — the *outcome* of a final rule, parse-free | eCFR versioner API, full part XML by date | coverage ~2017→present (stratify cohort by era) |
| **Comment attachment content** | the substance of "see attached" comments (disproportionately organizational) | URLs already in `attachments_json`; `downloads.regulations.gov` (verify quota in audit) | download + extraction/OCR volume; rate limits |

Why two text sources, not one (§8.2): final rules often publish only amendatory
instructions ("revise paragraph (b)(2)…"), so FR has no full final section to diff the
NPRM against — eCFR's before/after on the effective date gives an exact final state. Hybrid:
**FR XML** for preamble + proposed text; **eCFR** for the codified final.

---

## S1 — Rule-text acquisition → `rule_versions.parquet`

Walk the Plan 1 `rulemaking_chains` manifest; for each version fetch FR XML (fallback
regulations.gov `file_url` htm); parse into sections. Add the eCFR leg for final state.

Deliverable: `rule_versions(rin, docket_id, fr_doc_number, stage, section_id, section_kind
∈ {preamble, regtext}, text, source ∈ {fr, ecfr}, alignment_confidence)`. One row per
section per stage. Substrate for everything below; nothing downstream re-fetches.

Audit gate (Plan 3 / §7): FR linkage ≥ ~80% of cohort, section alignment works on spot
checks, and the **instructions-only share** of finals (decides how much weight the eCFR
leg carries).

---

## S2 — Section diff → `rule_diffs.parquet`

Align by `SECTNO` first, embedding-similarity assignment for renumbered remainders. Three
levels (§3.2): lexical (difflib opcodes → churn), structural (sections added/dropped,
modal-verb obligation sentences added/removed), semantic (per-section embedding similarity).

Plus **numeric-parameter deltas** (§8.4): extract `(quantity, unit, context)` from aligned
sections both sides and diff — "threshold 250→500", "compliance date +1yr". Deterministic,
explainable, no model; a §S4 precursor.

Deliverable: `rule_diffs(rin, from_doc, to_doc, section_id, change_kind, lexical_sim,
semantic_sim, tokens_added, tokens_removed, numeric_deltas)` + per-docket rollup
(`plasticity`, `preamble_growth`).

---

## S3 — `quotable` representation (code dependency for uptake, §8.1)

**Do not run uptake on `toSkeleton`** — it strips every digit and all punctuation by
design, and digits (thresholds, dates, dollar amounts, CFR cites) are the highest-value
uptake tokens. Add a 4th representation to `lib/text/normalize.ts`: `quotable` —
lowercased, whitespace-collapsed, punctuation-light, **digit- and order-preserving**.
Additive; the existing display/canonical/skeleton trio and their dual TS/SQL contract are
untouched.

---

## S4 — Efficacy metrics (need rule text)

| Metric | Method | Deliverable | Key control |
|---|---|---|---|
| **Acknowledgment** (§4.1) | segment final preamble into comment-response units (cue phrases + offline LLM cleanup), label accepted/partial/rejected/deferred, match units to comment clusters by embedding similarity | `comment_responses(docket_id, unit, label, matched_skeleton_hash, score)`; per-docket ack rate, acceptance rate, stance/org splits | self-count calibration (§8.6): preambles state "we received N comments on X" → free recall estimate; matcher abstains below threshold |
| **Uptake** (§4.2) | IDF-weighted shingles (§8.7) over `quotable` comment text vs. `rule_diffs` *insertions*; winnowed fingerprinting at scale | `comment_uptake(docket_id, skeleton_hash, uptake_score)` | **mask NPRM-quoted text** — comments echo the proposal; without the mask uptake is wildly inflated. IDF derives the boilerplate stoplist automatically |
| **Issue resolution** (§4.3) | numeric-delta precursor (S2) first; LLM ask-extraction + entailment against diff hunks for non-numeric asks, ack unit as supporting evidence | `cluster_resolution(docket_id, skeleton_hash, ask, resolved ∈ {yes,partial,no})` | pilot-set only until cheaper metrics prove the plumbing |
| **Plasticity / preamble growth** (completes §4.4) | from S2 rollup; correlate with the Plan 1 `docket_signals` | extends `docket_signals` | weak causal — frame as responsiveness, never causation |

---

## S5 — Attachment pipeline → `comment_attachment_text` partitions

The enabling dependency for running §S4 on organizational comments (their substance is the
PDF). URLs already mirrored; only content is missing.

1. **Prioritize** (don't boil the ocean): cohort dockets + `is_placeholder` comments (the
   attachment *is* the comment, flagged by Plan 1 W2) + a calibration sample.
2. **Content-hash dedup before download/OCR** (§8.5): same PDF attached thousands of times;
   HEAD on `content-length`/ETag → hash → extract **unique hashes only**, carry
   `n_duplicates` as campaign weight. Order-of-magnitude volume cut on orchestrated dockets;
   gives attachment-level campaign detection free.
3. **Extract:** PyMuPDF/pdfminer for digital, tesseract OCR fallback; record
   `extraction_quality` (don't mix OCR noise into clustering silently). Handle docx/jpg.
4. **Reuse Plan 1 machinery:** run `normalize.ts` skeleton/stance/template assignment on
   extracted text.

Deliverable: `comment_attachment_text(comment_id, attachment_idx, format, text,
extraction_quality, word_count, skeleton_hash, stance, content_hash, n_duplicates)`,
partitioned like the comment partitions. Analysis text becomes `body ⊕ attachment_text`.

---

## S6 — Interface (extend existing surfaces)

- **Docket "What changed" tab:** reads `rule_diffs` + `docket_efficacy`; section churn,
  numeric deltas, plasticity, ack/uptake — each with its quality flag
  (`alignment_confidence`, `extraction_quality`, abstention rate). **Components, not a
  composite score** (§8.8); factual labeled-approximate register from `findings.ts`.
- **Breakdown / fidelity panels:** per-cluster uptake + ack-status chips keyed by
  `skeleton_hash` (the two lab demo dockets gain the efficacy read).
- **ThreadedComments:** optional attachment excerpt + extraction-quality note.

---

## New artifacts (all offline-tier; browser reads only the small ones)

`rule_versions` · `rule_diffs` · `docket_efficacy` (plasticity, preamble growth, ack rate,
uptake share — read whole, index-file model) · `comment_responses` · `comment_uptake` ·
`cluster_resolution` · `comment_attachment_text` partitions.

## Gates & risk

- Blocked until Plan 1 RIN/links + Phase 0 audit go/no-go (cohort, FR coverage, alignment,
  instructions-only share).
- Pilot (S1+S2+S4 acknowledgment on ~50–100 anchor dockets) before scale-out; S5 and
  S4-uptake/resolution follow only on a successful pilot read.
- Real constraints: rate limits (attachments), OCR quality, LLM budget for S4
  acknowledgment/resolution, and **reuse ≠ influence** — NPRM mask + IDF stoplist handle
  the worst echoes; frame everything as reflection/responsiveness.
