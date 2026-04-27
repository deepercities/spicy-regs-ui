/**
 * Types for the Federal Register dataset (federal_register.parquet on R2).
 *
 * The parquet stores all columns as VARCHAR; this module translates the raw
 * row shape into the camel-cased TypeScript view used across components.
 */

export type FederalRegisterDoc = {
  documentNumber: string;
  title: string;
  abstract: string;
  documentType: string; // Rule | Proposed Rule | Notice | Presidential Document
  subtype: string; // Executive Order | Memorandum | Proclamation | …
  publicationDate: string; // ISO YYYY-MM-DD
  effectiveOn: string | null;
  commentsCloseOn: string | null;
  signingDate: string | null;
  agencySlugs: string; // comma-joined FR slugs
  docketIds: string[]; // already parsed from docket_ids_json
  htmlUrl: string;
  pdfUrl: string;
  executiveOrderNumber: string | null;
};

export type FRDocumentTypeFilter =
  | ''
  | 'Rule'
  | 'Proposed Rule'
  | 'Notice'
  | 'Presidential Document';

export type FRSort = 'recent' | 'oldest' | 'comment-deadline';

export type FRDateRange = '' | '7d' | '30d' | '90d' | '365d';

export type FRFilters = {
  documentType?: FRDocumentTypeFilter;
  agencySlug?: string;
  dateRange?: FRDateRange;
  sortBy?: FRSort;
};
