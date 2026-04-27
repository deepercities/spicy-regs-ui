'use client';

import { ChevronDown, X } from 'lucide-react';
import type {
  FRDateRange,
  FRDocumentTypeFilter,
  FRSort,
} from '@/lib/fr/types';

interface FRFeedFiltersProps {
  documentType: FRDocumentTypeFilter;
  onDocumentTypeChange: (t: FRDocumentTypeFilter) => void;
  dateRange: FRDateRange;
  onDateRangeChange: (r: FRDateRange) => void;
  sortBy: FRSort;
  onSortChange: (s: FRSort) => void;
  agencySlug: string;
  onAgencySlugChange: (s: string) => void;
}

const DOC_TYPE_OPTIONS: { key: FRDocumentTypeFilter; label: string }[] = [
  { key: '', label: 'All types' },
  { key: 'Rule', label: 'Rule' },
  { key: 'Proposed Rule', label: 'Proposed Rule' },
  { key: 'Notice', label: 'Notice' },
  { key: 'Presidential Document', label: 'Presidential' },
];

const DATE_OPTIONS: { key: FRDateRange; label: string }[] = [
  { key: '', label: 'All time' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: '365d', label: 'Last year' },
];

const SORT_CHIPS: { key: FRSort; label: string }[] = [
  { key: 'recent', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'comment-deadline', label: 'Comment deadline' },
];

/**
 * Filter bar for /federal-register. FR-specific dimensions: document_type,
 * date range, agency slug (free-text — FR has hundreds of slugs and no
 * curated list), and sort. The FR data is too large to enumerate agencies
 * client-side, so users type a slug substring.
 */
export function FRFeedFilters({
  documentType,
  onDocumentTypeChange,
  dateRange,
  onDateRangeChange,
  sortBy,
  onSortChange,
  agencySlug,
  onAgencySlugChange,
}: FRFeedFiltersProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Row 1: dropdowns + agency text input */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Document Type */}
        <div className="relative">
          <ChevronDown
            size={14}
            className="text-[var(--muted)] pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
          />
          <select
            value={documentType}
            onChange={(e) => onDocumentTypeChange(e.target.value as FRDocumentTypeFilter)}
            className="filter-chip appearance-none pr-7 cursor-pointer bg-[var(--surface)] text-[var(--foreground)] border-none focus:outline-none"
          >
            {DOC_TYPE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Date Range */}
        <div className="relative">
          <ChevronDown
            size={14}
            className="text-[var(--muted)] pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
          />
          <select
            value={dateRange}
            onChange={(e) => onDateRangeChange(e.target.value as FRDateRange)}
            className="filter-chip appearance-none pr-7 cursor-pointer bg-[var(--surface)] text-[var(--foreground)] border-none focus:outline-none"
          >
            {DATE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Agency slug text input */}
        <div className="relative flex items-center">
          <input
            type="text"
            value={agencySlug}
            placeholder="Agency slug (e.g. environmental-protection-agency)"
            onChange={(e) => onAgencySlugChange(e.target.value)}
            className="filter-chip bg-[var(--surface)] text-[var(--foreground)] border-none focus:outline-none placeholder:text-[var(--muted)] min-w-[280px]"
          />
          {agencySlug && (
            <button
              onClick={() => onAgencySlugChange('')}
              className="absolute right-2 text-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="Clear agency filter"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Sort chips */}
      <div className="flex items-center gap-1.5">
        {SORT_CHIPS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onSortChange(opt.key)}
            className={`filter-chip ${sortBy === opt.key ? 'filter-chip-active' : ''}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
