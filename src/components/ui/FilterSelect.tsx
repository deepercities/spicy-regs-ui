'use client';

import * as React from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Pill-style select for filter bars, built on Radix Select.
 *
 * Replaces the three hand-rolled wrappers in FeedFilters, FRFeedFilters,
 * and TopicFilter — each of which had its own copy of:
 *   <div className="relative">
 *     <ChevronDown className="absolute right-2 ..." />
 *     <select className="filter-chip appearance-none pr-7 ..." ...>
 *       {OPTIONS.map(...)}
 *     </select>
 *   </div>
 *
 * The Radix version gives us proper keyboard / aria semantics out of
 * the box (Tab → Space/Enter to open, Arrow keys to navigate, Escape
 * to close, type-ahead by first letter) and renders a styled popover
 * instead of the OS native picker, so the menu chrome looks consistent
 * with the rest of the app.
 *
 * Options can be plain strings (label = value) or `{ value, label }`
 * pairs. `prefix` adds a non-clickable label inside the trigger (e.g.
 * "Sort by") to match the inline labels the original filters had.
 */
export interface FilterSelectOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
}

export interface FilterSelectProps<T extends string = string> {
  value: T;
  onValueChange: (value: T) => void;
  options: FilterSelectOption<T>[];
  /** Inline label rendered inside the trigger before the selected value. */
  prefix?: React.ReactNode;
  /** Accessible name for screen readers when no visible prefix is set. */
  ariaLabel?: string;
  /** Placeholder when no value is selected. */
  placeholder?: string;
  /** Extra classes on the trigger button. */
  className?: string;
}

export function FilterSelect<T extends string = string>({
  value,
  onValueChange,
  options,
  prefix,
  ariaLabel,
  placeholder,
  className = '',
}: FilterSelectProps<T>) {
  return (
    <Select.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <Select.Trigger
        aria-label={ariaLabel}
        className={`filter-chip appearance-none cursor-pointer flex items-center gap-1.5 pr-7 relative ${className}`}
      >
        {prefix && <span className="text-[var(--muted)]">{prefix}</span>}
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)]">
          <ChevronDown size={14} />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-50 min-w-[var(--radix-select-trigger-width)] rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg overflow-hidden"
        >
          <Select.Viewport className="p-1">
            {options.map((opt) => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                className="relative flex items-center pl-7 pr-3 py-1.5 text-xs rounded-md cursor-pointer text-[var(--foreground)] data-[highlighted]:bg-[var(--surface-elevated)] data-[highlighted]:text-[var(--accent-primary)] data-[state=checked]:text-[var(--accent-primary)] focus:outline-none"
              >
                <Select.ItemIndicator className="absolute left-2 top-1/2 -translate-y-1/2">
                  <Check size={12} />
                </Select.ItemIndicator>
                <Select.ItemText>{opt.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
