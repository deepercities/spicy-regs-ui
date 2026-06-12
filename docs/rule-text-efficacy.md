# Rule-text change & comment efficacy: feasibility analysis

A continuation of the ETL-gaps investigation (`docs/architecture.md` on
`upstream/ui-investigation`). That work asked *what the pipeline drops and what the
browser computes live*. This one asks two harder questions:

1. **Rule-text drift** — can we diff/compare the documents in the corpus to see how a
   rule's text changes as it moves through the process (NPRM → final)?
2. **Comment efficacy** — can we measure to what degree comment text, framing, or issues
   are reflected in those documents, including comments whose substance lives in PDF
   attachments?

Short answer: **both are feasible, but neither is computable from the corpus as mirrored
today.** The mirror carries *metadata and comment body text*; it carries **no rule text at
all** — not for proposed rules, not for final rules. Every approach below therefore starts
with one new acquisition stage (rule full text, preferably Federal Register XML), and the
attachment-dependent metrics need a second one (comment-attachment text extraction). Both
stages are offline-tier work that lands as small Parquet rollups, exactly the shape the
existing `feed_summary`/`comments_index` index-file model expects.

Caveat on verification: this session's sandbox had no network route to R2, the FR API, or
regulations.gov, so corpus facts below are sourced from the query code (every column the
UI selects) and from the `DESCRIBE` audit recorded in `docs/architecture.md`
(2026-05-30) rather than a fresh scan. §7 lists the audit queries to run first.

---

## 1. What the corpus gives us today

| Artifact | Columns in evidence | What it contributes | What it lacks |
|---|---|---|---|
| `documents.parquet` (~57 MB) | `document_id, docket_id, agency_code, title, document_type, posted_date, modify_date, comment_start_date, comment_end_date, file_url` | the **lifecycle skeleton**: `document_type = 'Proposed Rule'` / `'Rule'` rows pair into NPRM→final transitions per docket (pairing SQL already exists in `getRulemakingLifecycles`) | any text. `file_url` is a single nullable link (htm/pdf); no attachment list, no FR document number, no RIN, no subtype |
| comment partitions + `comments.parquet` | `comment_id, docket_id, agency_code, title, comment, document_type, posted_date, modify_date, receive_date, attachments_json` | comment **body text** at scale, plus — critically — `attachments_json` already carries per-attachment `{title, formats:[{format, url}]}` (parsed today in `ThreadedComments`). The attachment *URLs* are in the corpus; only their *content* is missing | submitter fields (`first_name/last_name/organization/category`) — the already-documented gap; attachment text |
| `federal_register.parquet` (~793K rows) | `document_number, title, abstract, document_type, subtype, publication_date, effective_on, comments_close_on, signing_date, agency_slugs, docket_ids_json, html_url, pdf_url, executive_order_number` | the **bridge to clean full text**: `document_number` is the key into the FR API, where every document exposes `raw_text_url` / `body_html_url` / `full_text_xml_url`. `docket_ids_json` links FR docs back to dockets (used by `getFRPublicationsForDocket`) | RIN (`regulation_id_numbers` is in the same API payload but wasn't kept); the full-text URLs themselves; CFR references |
| text machinery (investigation branch) | `lib/text/normalize.ts` (dual TS/SQL normalization), `lib/text/stance.ts` (phrase-lexicon stance), `lib/comments/templates.ts` (template families), `getCommentClustersMultiTier` | reusable as-is on attachment text once extracted; `is_placeholder` already flags "see attached" comments — i.e. **the priority download set is already identifiable** | runs in-browser; anything heavier (embeddings, LLM passes) needs the offline tier |

Two structural facts shape everything below:

- **The rule text we want to diff is the Federal Register document.** What regulations.gov
  serves at `file_url` *is* the FR publication (as htm/pdf). The FR XML is the same
  content with structure: preamble vs. regulatory text are separately tagged
  (`<SUPLINF>`, `<REGTEXT>`, `<AMDPAR>`, `<SECTION>`/`<SECTNO>`), which is the difference
  between diffing two blobs and diffing aligned CFR sections. So the acquisition target
  is FR XML keyed by `document_number`, with regulations.gov `file_url` as fallback for
  docs that never linked to FR.
- **Stance ≠ sentiment, and that's the right call to keep.** The user-facing question is
  whether *issues and framing* land in the final document; emotional sentiment adds
  little. The existing stance/template machinery is the correct unit of analysis — the
  efficacy metrics below operate on **template families** (campaigns counted once) and
  topic clusters, not raw comment rows.

---

## 2. Feasibility verdicts

| Capability | Verdict | Blocking dependency |
|---|---|---|
| NPRM→final pairing per docket | **works today** (`getRulemakingLifecycles` CTE) | none; ambiguity handling needed for multi-NPRM dockets |
| Rule-text acquisition | **feasible, new ETL stage** | FR full-text fetch keyed on `document_number`; needs `documents.parquet` to carry `frDocNum` (in the regulations.gov API payload, currently dropped) or matching via `docket_ids_json` + type + date |
| Section-aligned NPRM↔final diff | **feasible offline** | rule text above; FR XML parsing |
| Preamble comment-response extraction | **feasible, highest value/effort ratio** | rule text above; final-rule preambles are an APA-mandated, semi-structured record of which comments the agency heard and what it changed |
| Comment-language uptake in final text | **feasible with controls** (mask NPRM-quoted text) | rule text + diff |
| Attachment PDF → text → stance/topics | **feasible but must be scoped** | download + extraction stage; volume is the constraint, not technique |
| Cross-docket rulemaking lineage (RIN) | **cheap ETL add** | already flagged as gap; FR payload carries `regulation_id_numbers` |

---

## 3. Rule-text drift: acquisition and diff approaches

### 3.1 Acquisition

For each docket with a Proposed Rule (extend later to Interim Final / Supplemental
Proposed):

1. Resolve its FR documents: today via `docket_ids_json` containment (the
   `fr_docket_links` link table already proposed in the architecture note); better via
   RIN once kept. Classify by FR `document_type` (`PRORULE` / `RULE`) and order by
   `publication_date` to build the version chain — a docket can legitimately have
   NPRM → supplemental NPRM → interim final → final → correction.
2. Fetch `full_text_xml_url` per FR document (the URL comes from
   `/api/v1/documents/{document_number}.json`; one extra call per doc, or the FR bulk-data
   XML on govinfo for backfill). Fallback: regulations.gov `file_url` htm.
3. Parse into a versioned structure: `(docket_id, fr_doc_number, stage, section_id,
   section_kind ∈ {preamble, regtext}, text)`. CFR section numbers (`<SECTNO>`) are the
   alignment keys.

Store as `rule_versions.parquet` — one row per section per stage. This is the substrate
for everything else; nothing downstream re-fetches.

### 3.2 Diff levels (cheap → rich)

- **Lexical:** per aligned section, token-level edit distance / difflib opcodes →
  `% sections unchanged / modified / added / dropped`, normalized churn. Robust, fully
  deterministic, good enough for the headline "how much did this rule move" metric.
- **Structural:** sections appearing/disappearing between stages; requirement-bearing
  sentence deltas (modal-verb sentences: *shall/must/may not* added or removed) — a cheap
  proxy for whether obligations tightened or loosened, not just wording polish.
- **Semantic:** per-section embedding similarity to catch rewrites that lexical distance
  overstates, and to align sections when numbering shifts between NPRM and final
  (alignment by SECTNO first, embedding-similarity assignment for renumbered remainders).

Output: `rule_diffs.parquet (docket_id, from_doc, to_doc, section_id, change_kind,
lexical_sim, semantic_sim, tokens_added, tokens_removed)` plus a per-docket rollup
(`plasticity` = churn summary, `preamble_growth` = final preamble length / NPRM preamble
length — preambles grow roughly with the volume of comment discussion the agency had to
answer, so it's a free responsiveness proxy).

---

## 4. Efficacy: are comments reflected in the documents?

Four metric families, ordered by evidentiary strength per unit of effort. All operate on
template families / topic clusters so that a 500K-comment campaign counts as one voice
with a weight, not 500K independent signals.

### 4.1 Acknowledgment (comment ↔ final-rule preamble)

Final-rule preambles systematically contain comment-response discussion ("We received N
comments on X… In response, we have revised §Y / we decline to…"). This is the closest
thing to ground truth the process produces, because the APA obliges agencies to respond
to significant comments.

- Segment the final preamble into comment-response units (header/cue-phrase rules get
  far; an offline LLM pass cleans up the remainder and labels each unit
  *accepted / partially accepted / rejected / deferred*).
- Match units to comment clusters: embedding similarity between unit text and cluster
  representative text (template-family exemplar, or topic-cluster centroid).
- **Metrics:** per-docket *acknowledgment rate* (share of comment clusters matched by ≥1
  response unit), *acceptance rate* (share of matched units labeled accepted), and the
  stance/segment splits — e.g. were oppose-clusters acknowledged at the same rate as
  support-clusters; org vs. individual splits once the `category`/`organization` ETL gap
  closes.

### 4.2 Uptake (comment language → inserted rule text)

The text-reuse approach from the regulatory-responsiveness literature (Libgober;
Judge-Lord): commenters often propose language, and agencies sometimes adopt it.

- Compute the *insertions* between NPRM and final (`rule_diffs` hunks with
  `tokens_added`).
- Shingle comments (template exemplars + long-form unique comments + attachment text)
  into n-grams (n≈8–12 words); score overlap with inserted text.
- **Critical control:** mask any comment n-gram that also occurs in the NPRM itself —
  comments quote the proposal heavily, and without this mask uptake is wildly inflated.
  Mask boilerplate (statutory citations, agency names) the same way.
- **Metrics:** per-cluster *uptake score* (max contiguous reuse in insertions), per-docket
  share of inserted text traceable to any comment, and *who* gets uptake (again gated on
  submitter fields).

### 4.3 Issue-level resolution (asks → changes)

Stronger than text reuse, costlier: for each major cluster, extract its *ask* ("raise the
threshold", "exempt small entities") with an offline LLM pass, then judge against the
relevant diff hunks whether the ask was satisfied (entailment-style, with the
acknowledgment unit from §4.1 as supporting evidence). This is the metric that answers
"did the framing/issue land" rather than "did the words land". Run it on the pilot set
only until the cheaper metrics prove the plumbing.

### 4.4 Portfolio-level outcome correlations

With `rule_diffs` + lifecycle data, zero additional NLP: does plasticity correlate with
comment volume, stance balance, org participation, agency, docket age? Withdrawn/stuck
rules vs. opposition share (sharper once the `withdrawn`/`reason_withdrawn` gap closes).
These are weak causal claims but cheap dashboard material and good sanity checks on the
finer metrics.

### Validity threats (apply to all four)

- **Reuse ≠ influence.** Agency and commenter may both echo a statute, a court opinion,
  or the agency's own prior documents. The NPRM mask handles the worst case; a stoplist
  of statutory/CFR boilerplate handles most of the rest. Frame outputs as
  *responsiveness/reflection*, never causation.
- **Campaign inflation.** Already solved structurally by template families — keep it.
- **Boilerplate acknowledgment.** "We considered all comments" matches everything;
  response-unit segmentation must require issue-specific content (length + specificity
  thresholds before a unit is matchable).
- **Stance lexicon limits.** The phrase lexicon is a labeled *signal*; efficacy splits by
  stance inherit its noise. The planned per-template precomputed stance (offline
  classifier keyed by `skeleton_hash`) upgrades every metric here without call-site
  changes — same swap-in contract `lib/text/stance.ts` already documents.

---

## 5. Attachment text extraction (the enabling dependency for 4.x on org comments)

Substantive comments — especially organizational ones — are disproportionately "see
attached PDF", which today are invisible to stance, clustering, and all of §4. The URLs
are already mirrored in `attachments_json`; only content extraction is missing.

Pipeline (offline tier):

1. **Prioritize, don't boil the ocean.** Download set = attachments on (a) dockets in the
   study cohort (paired NPRM→final, comment count ≥ threshold), (b) comments flagged
   `is_placeholder` (body adds nothing — the attachment *is* the comment), (c) long-tail
   sampled for calibration. Corpus-wide attachment count is unknown until the §7 audit;
   per-docket it's typically a few % of comments but covers most of the substantive ones.
2. **Extract:** PyMuPDF/pdfminer for digital PDFs; OCR (tesseract) fallback for scanned —
   expect a 10–20% scanned share, and record an `extraction_quality` flag rather than
   silently mixing OCR noise into clustering. Handle docx/jpg formats listed in
   `formats[]`.
3. **Reuse the existing machinery:** run the same `normalize.ts` skeleton →
   `skeleton_hash`, stance, template-family assignment on attachment text, stored as
   `comment_attachment_text.parquet (comment_id, attachment_idx, format, text,
   extraction_quality, word_count, skeleton_hash, stance, …)` partitioned like the
   comment partitions so pruning still applies.
4. Comment-level analysis text becomes `body ⊕ attachment_text` (placeholder bodies
   replaced, substantive bodies concatenated).

Rate limits are the real constraint (regulations.gov API keys are ~1,000 req/h; the
`downloads.regulations.gov` URLs in `attachments_json` may bypass the API quota — verify
in the §7 audit). At pilot scope (≤100 dockets) this is days of polite crawling, not
weeks.

---

## 6. Architecture fit

Everything heavy is offline-tier (consistent with §5 of the architecture note); the
browser only ever reads small baked artifacts:

| New artifact | Grain | Feeds |
|---|---|---|
| `rule_versions.parquet` | docket × FR doc × section | offline only (diff input) |
| `rule_diffs.parquet` | docket × stage-pair × section | docket "what changed" view; §4.2 input |
| `docket_efficacy.parquet` | docket | plasticity, preamble growth, acknowledgment rate, uptake share — one small file, read whole, index-file model |
| `comment_responses.parquet` | docket × response unit | acknowledgment drill-down UI |
| `comment_uptake.parquet` | docket × skeleton_hash | per-cluster uptake + ack status chips on the existing breakdown/fidelity panels |
| `comment_attachment_text` partitions | comment × attachment | offline analysis; optional excerpt surfacing in `ThreadedComments` |
| `fr_docket_links.parquet` (+ `rin`) | docket × document_number | replaces the `LIKE '%"id"%'` scan *and* keys acquisition |

UI-wise this extends the existing surfaces rather than inventing new ones: a third
docket-page tab ("What changed") reading `rule_diffs`/`docket_efficacy`, and the /lab
fidelity panel gains the efficacy read for its two demo dockets.

ETL-gap additions (extending the §1 table in the architecture note):

| Field | Where | Unblocks |
|---|---|---|
| `frDocNum` on document rows | regulations.gov payload, currently dropped | exact doc↔FR join (no date/type matching heuristics) |
| `regulation_id_numbers` on FR rows | FR payload, currently dropped | multi-docket lineage; NPRM↔final chains that cross dockets |
| `subtype`/full attachment list on documents | regulations.gov payload | distinguishing corrections/extensions from substantive stages |
| (already listed) comment `organization`/`category`, `withdrawn` | — | the "who gets heard" splits in §4 and outcome states in §4.4 |

---

## 7. Phase 0: the audit to run before committing effort

These resolve every "unknown until verified" above. All but the last are runnable in the
browser console of the deployed app or any network-enabled DuckDB session against R2:

```sql
-- Cohort size: dockets with a true NPRM→final pair AND non-trivial comment volume
WITH props AS (SELECT docket_id, MIN(TRY_CAST(posted_date AS DATE)) d
               FROM read_parquet('$R2/documents.parquet')
               WHERE document_type = 'Proposed Rule' GROUP BY 1),
finals AS (SELECT docket_id, MIN(TRY_CAST(posted_date AS DATE)) d
           FROM read_parquet('$R2/documents.parquet')
           WHERE document_type = 'Rule' GROUP BY 1)
SELECT COUNT(*) FROM props JOIN finals USING (docket_id)
JOIN read_parquet('$R2/feed_summary.parquet') USING (docket_id)
WHERE finals.d >= props.d AND comment_count >= 100;

-- Multi-stage ambiguity rate (dockets with >1 NPRM or >1 final → need chain logic)
SELECT SUM((np > 1 OR nf > 1)::INT) AS ambiguous, COUNT(*) AS paired FROM (
  SELECT docket_id,
         SUM((document_type = 'Proposed Rule')::INT) np,
         SUM((document_type = 'Rule')::INT) nf
  FROM read_parquet('$R2/documents.parquet') GROUP BY 1
) WHERE np >= 1 AND nf >= 1;

-- FR linkage coverage: how many cohort dockets resolve to FR documents at all
SELECT COUNT(DISTINCT d.docket_id)
FROM cohort d JOIN read_parquet('$R2/federal_register.parquet') fr
  ON fr.docket_ids_json LIKE '%"' || d.docket_id || '"%';

-- Attachment burden: counts + format mix for the cohort's comments
SELECT json_array_length(attachments_json) n_att, COUNT(*)
FROM cohort_comments GROUP BY 1;
```

Plus two manual spot-checks: (1) fetch FR XML for ~5 known NPRM/final pairs and confirm
`<REGTEXT>`/`<SECTNO>` parsing yields alignable sections across eras and agencies;
(2) download ~50 sampled attachments to measure the scanned-PDF share and whether
`downloads.regulations.gov` URLs are quota-free.

**Go/no-go gates:** cohort ≥ a few hundred dockets; FR linkage coverage ≥ ~80% of cohort
(else prioritize the `frDocNum`/RIN ETL fix first); section alignment works on the spot
checks. Then pilot (§3 + §4.1 on ~50–100 dockets) before any scale-out, with §4.2/§4.3
and the attachment pipeline (§5) following only on a successful pilot read.
