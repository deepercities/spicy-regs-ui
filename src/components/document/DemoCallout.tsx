'use client';

import Link from 'next/link';

interface DemoCalloutProps {
  agencyCode: string;
  docketId: string;
}

/**
 * Honest-by-design callout for the one place the data mirror falls shortest:
 * comments don't link to specific documents, so the Document page can't show
 * "the N comments on this proposed rule." The dashed amber region owns that gap
 * instead of hiding it, and routes the reader to the docket-level comments.
 */
export function DemoCallout({ agencyCode, docketId }: DemoCalloutProps) {
  return (
    <div
      className="rounded-xl border border-dashed p-4"
      style={{ borderColor: 'rgba(217,119,6,0.4)', background: 'rgba(217,119,6,0.06)' }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider"
              style={{ background: 'rgba(217,119,6,0.12)', color: 'var(--accent-amber)', border: '1px solid rgba(217,119,6,0.25)' }}>
          demo
        </span>
        <span className="text-sm font-semibold" style={{ color: 'var(--accent-amber)' }}>
          Per-document comment filtering pending
        </span>
      </div>
      <p className="text-xs text-[var(--muted)] mb-2.5 leading-relaxed">
        Comments don&apos;t link to specific documents in the data mirror yet — this page can&apos;t
        show &ldquo;the comments on this proposed rule.&rdquo;
      </p>
      <Link
        href={`/sr/${agencyCode}/${encodeURIComponent(docketId)}?tab=comments`}
        className="text-xs font-semibold"
        style={{ color: 'var(--accent-primary)' }}
      >
        See all comments on the parent docket →
      </Link>
    </div>
  );
}
