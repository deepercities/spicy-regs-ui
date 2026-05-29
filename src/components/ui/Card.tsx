'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';

/**
 * Generic card surface.
 *
 * Three variants correspond to the three card styles the codebase had
 * been hand-rolling:
 *
 * - `default` — the plain `.card` (1.5px border, 12px radius, surface bg).
 *   Used by SearchResultCard, FederalRegisterPost, MiniDocketCard,
 *   MiniFRCard.
 * - `gradient` — the `.card-gradient` with the subtle inner-gradient
 *   border treatment. Used by AgencyIdentity and the home-page feature cards.
 * - `post` — the heavier `.docket-post` with the accent-primary border.
 *   Used by DocketPost.
 *
 * `asChild` (via Radix Slot) lets you forward the card chrome to a child
 * element like a `<Link>` so the entire card is clickable without an
 * extra wrapping div. Matches the pattern in shadcn-style component
 * libraries.
 *
 * Padding is intentionally NOT baked in — call sites use different
 * paddings (`p-3`, `p-4`, `p-5`) and a fixed default would force every
 * caller to either accept it or override. Pass it via `className`.
 */
export type CardVariant = 'default' | 'gradient' | 'post';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  asChild?: boolean;
}

const VARIANT_CLASS: Record<CardVariant, string> = {
  default: 'card',
  gradient: 'card-gradient',
  post: 'docket-post',
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'default', asChild = false, className = '', ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'div';
  return (
    <Comp
      ref={ref}
      className={`${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    />
  );
});
