import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

/**
 * Shared loading / empty / error states.
 *
 * These exist because the old UI hand-rolled a different spinner and a
 * different "nothing here" treatment on nearly every page, and several
 * pages had no empty state at all -- they rendered a bare grid, which read
 * as a broken page when a user genuinely had no data yet.
 */

export function Spinner({
  className,
  label = 'Loading',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-block size-5 animate-spin rounded-pill border-2 border-hairline-strong border-t-ink',
        className
      )}
    />
  );
}

export function LoadingState({
  message = 'Loading…',
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-base py-xxl', className)}
    >
      <Spinner />
      <p className="text-body-md text-muted">{message}</p>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      variant="orb"
      className={cn('flex flex-col items-center gap-base py-xxl text-center', className)}
    >
      {icon && (
        <span className="flex size-12 items-center justify-center rounded-pill bg-surface-strong text-muted [&_svg]:size-5">
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-xs">
        <h3 className="font-display text-display-sm text-ink">{title}</h3>
        {description && (
          <p className="mx-auto max-w-md text-body-md text-body">{description}</p>
        )}
      </div>
      {action}
    </Card>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      variant="panel"
      className={cn('flex flex-col items-center gap-base text-center', className)}
    >
      <div className="flex flex-col gap-xs">
        <h3 className="font-sans text-title-md text-ink">{title}</h3>
        {description && <p className="text-body-md text-body">{description}</p>}
      </div>
      {action}
    </Card>
  );
}

/**
 * A single headline number. Used on dashboards.
 *
 * Note this renders whatever it is given -- there is intentionally no
 * built-in placeholder number, so a caller cannot accidentally ship an
 * invented statistic the way the old landing page did.
 */
export function Stat({
  value,
  label,
  hint,
  className,
}: {
  value: React.ReactNode;
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-xxs', className)}>
      <span className="font-display text-display-md text-ink">{value}</span>
      <span className="text-body-strong text-ink">{label}</span>
      {hint && <span className="text-caption text-muted">{hint}</span>}
    </div>
  );
}

/**
 * Horizontal meter. Replaces the old `Progress` usage on results/summary.
 * `max` is explicit because the codebase mixes 0-10 scores with 0-100
 * percentages, and the old UI silently treated a 0-10 score as a percentage.
 */
export function Meter({
  value,
  max = 100,
  label,
  valueLabel,
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  valueLabel?: string;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 100;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  return (
    <div className={cn('flex flex-col gap-xs', className)}>
      {(label || valueLabel) && (
        <div className="flex items-baseline justify-between gap-sm">
          {label && <span className="text-caption text-body">{label}</span>}
          {valueLabel && <span className="text-caption text-ink">{valueLabel}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-strong"
      >
        <div
          className="h-full rounded-pill bg-ink transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
