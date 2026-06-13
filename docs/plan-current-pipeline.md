# Plan 1 — within the current ETL pipeline & interface

Plan 1 of 3, derived from [`rule-text-efficacy.md`](./rule-text-efficacy.md) and the
ETL-gaps note [`architecture.md`](./architecture.md). Companion docs:
[Plan 2 — new data sources](./plan-new-data-sources.md),
[Plan 3 — sequencing](./plan-sequencing.md).

**Scope.** Everything here is computable from data the pipeline **already fetches**
(regulations.gov dockets/documents/comments + federalregister.gov) and surfaced in the
existing Next.js / DuckDB-WASM interface. No new external fetch target.

**The clarifying result that defines this boundary:** every *field* the rule-text /
efficacy work needs comes from an API response the pipeline already calls — RIN, frDocNum,
submitter org/category, withdrawn status are all in payloads we already hit and currently
drop. Only new *artifacts* (full rule text, eCFR, attachment content) require a new source,
and those are [Plan 2](./plan-new-data-sources.md). So all field recovery is a change
*within* the current pipeline, and a large slice of analytics ships before any new
acquisition.

Two kinds of change: **(a)** retain dropped fields; **(b)** materialize rollups +
precomputed columns and wire them into existing surfaces, following the index-file model
(`feed_summary`/`comments_index`) — small, denormalized, read whole.

---

## W1 — ETL field recovery (retain what the current API calls already return)

Same sources, same calls; stop dropping columns. Keep derived comment columns *inside the
Hive partitions* (`agency/docket/year/month`) so `buildCommentsSource` pruning still
applies — don't centralize into a flat file the client must scan.

| Field | Source (already called) | Lands on | Unblocks | Priority |
|---|---|---|---|---|
| `regulation_id_numbers` (RIN) | federalregister.gov payload | FR rows | FR-side version chains (W4), cross-docket lineage; **highest leverage** (§8.3) | 1 |
| `frDocNum` | regulations.gov documents payload | document rows | exact doc↔FR join, no date/type heuristics | 2 |
| comment `organization`, `category` | regulations.gov comments payload | comment partitions | individual/org split, org leaderboard, the "who gets heard" efficacy splits | 2 |
| comment `first_name`, `last_name` | regulations.gov comments payload | comment partitions | signature-masking (`sqlStripName`/`toSkeleton` are wired-but-inert) | 3 |
| `withdrawn`, `reason_withdrawn` | regulations.gov payload | docket/document rows | abandoned vs. withdrawn vs. pending in lifecycle; outcome correlations | 3 |
| document `subtype` + full attachment list | regulations.gov documents payload | document rows | distinguishing corrections/extensions from substantive stages; real attachment table | 3 |
| comment `additional_rins` | regulations.gov payload | comment partitions | campaign joins across dockets in one rulemaking | 4 |

Touchpoints downstream already waiting: `ThreadedComments` reads `organization` (dead
until column lands); `sqlStripName` inert in `getCommentClustersMultiTier`;
`AttachmentsTable` degrades to 0-or-1 file; lifecycle "stuck" logic is an age-window
heuristic standing in for `withdrawn`.

---

## W2 — Precomputed comment-text columns (architecture.md §3)

Move per-row text work off the browser main thread into the ETL, computed with the **same**
`lib/text/normalize.ts` SQL builders the client uses (byte-for-byte parity is the swap-in
contract). Stored in the comment partitions.

| Column | Replaces (live work today) | Enables |
|---|---|---|
| `skeleton_hash` | live `md5` over normalized text per view | template clustering → `GROUP BY skeleton_hash`; **global**, so cross-docket campaign detection is one group-by |
| `simhash` / `minhash` (64-bit) | the client's sorted-token near-dup approximation + `agglomerateTemplates` | reword-tolerant near-dup via Hamming-band LSH (the real version `templates.ts` only stands in for) |
| `word_count`, `is_placeholder` | recomputed per view | identifies "see attached" set (the Plan 2 attachment priority list) |
| per-template `stance` + `confidence`, keyed by `skeleton_hash` | JS phrase-lexicon re-scored every view | stance splits for analytics; upgradeable to an offline classifier with no call-site change |

Note: this is the *current heuristic stance* baked, not a new model — same `stance.ts`
logic, computed once. A higher-fidelity classifier is Plan 2 (needs the offline tier).

---

## W3 — Rollups & link tables (architecture.md §2)

Hot scans → pre-baked artifacts. All from current data.

| Artifact | Grain | Replaces scan in | 
|---|---|---|
| `fr_docket_links` (explode `docket_ids_json`, + RIN once W1) | docket × document_number | `getFRPublicationsForDocket` `LIKE '%"id"%'` over 793K — **and is the join key Plan 2 acquisition needs** |
| `agency_monthly_volume` (typed) | agency × month × doc_type | `getAgencyMonthlyVolumeBatch`, `getDocumentCountsByAgencyMonth`, discovery surge |
| `discovery_signals` | agency | `getDiscoverySignals` full `documents` scan |
| `agency_stats` | agency | `getAgencyStats` / `getAllAgencyCounts` |
| per-docket cluster summary + daily comment series | docket (+ skeleton_hash) | `getCommentVolumeAndClusters`, `getCommentVolumeByDay` live hashing |
| `rulemaking_lifecycles` (summary + sample) | agency | `getRulemakingLifecycles` multi-CTE self-join |

Cache these at the edge (CDN/KV/IndexedDB) — tiny, identical across viewers; removes the
re-run-per-viewer cost the current in-memory cache can't.

---

## W4 — FR-side rulemaking chains (lifecycle hardening, §8.3)

`getRulemakingLifecycles` pairs `MIN(posted_date)` of Proposed Rule vs. Rule — fine for
duration percentiles, **wrong as a version manifest** (corrections typed 'Rule' → false
short lifecycles; multi-NPRM dockets collapse). Rebuild from the FR side using metadata we
already mirror plus RIN (W1):

- group FR docs by RIN (fall back to `docket_ids_json`), order by `publication_date`;
- fold corrections into their parent (`correction_of` / subtype);
- emit `rulemaking_chains(rin, docket_id, ordered [document_number, stage, date])`.

This is **metadata-only** — no rule text yet — so it ships in Plan 1. It becomes the
manifest Plan 2 acquisition walks. NPRM→final is then one derived endpoint pair among
several adjacent-version pairs.

---

## W5 — Analytics computable today (efficacy §4.4, minus plasticity)

Plasticity/uptake need rule text (Plan 2). But the **outcome-correlation** half of §4.4 is
computable now: comment volume (`comments_index`), stance balance & org share (W1+W2),
lifecycle duration & completion (W4), withdrawn/stuck (W1) — correlated per docket/agency.

Deliverable: `docket_signals(docket_id, comment_count, template_concentration,
stance_balance, org_share, lifecycle_days, completed, withdrawn)` + a dashboard read.
Weak causal claims, cheap, and a sanity check the Plan 2 metrics will be measured against.
Publish components, never a composite (§8.8).

---

## W6 — Interface activations

Mostly lighting up code that already exists, once W1–W5 land:

- **Inert features:** `isOrg`/"Organization" badge, `sqlStripName` masking, org leaderboard,
  individual/org split (need W1 org/category); withdrawn-vs-abandoned lifecycle (need W1).
- **Cross-docket campaigns:** same `skeleton_hash` across dockets/agencies (W2) — a new
  panel or a cross-link on the existing breakdown.
- **Docket chain view:** render the W4 version chain as metadata (stages, dates, doc
  numbers) — the shell the Plan 2 "What changed" diff tab later fills in.
- **Faster everything:** swap live-scan methods in `useDuckDBService` to read W3 rollups.

---

## Dependencies & risk (Plan-1-internal)

- W4 needs RIN from W1; W5 needs W1+W2+W4; W6 needs the columns it activates. W2/W3 are
  largely independent and can land in parallel with W1.
- Lowest risk, highest immediate UI payoff: W3 + W6 activations. Highest leverage for
  Plan 2: W1 (RIN) → W4 → `fr_docket_links`.
- No new network egress, no new rate limits, no model budget. The ceiling on Plan 1 is
  pipeline engineering time, not feasibility.
