import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * DESIGN.md `badge-pill`: surface-strong plate, uppercase 12/600 caption
 * with wide tracking, pill radius.
 *
 * Status variants keep the same plate geometry and carry meaning through a
 * small colored dot rather than a saturated fill -- a wash of green/red
 * pills would fight the system's "no saturated brand color" rule.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption-upper uppercase whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-surface-strong text-ink',
        outline: 'border border-hairline-strong bg-transparent text-body',
        dark: 'bg-surface-dark text-on-dark',
        success: 'bg-surface-strong text-ink',
        error: 'bg-surface-strong text-ink',
        pending: 'bg-surface-strong text-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

const dotColor: Record<string, string> = {
  success: 'bg-success',
  error: 'bg-error',
  pending: 'bg-muted-soft',
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, children, ...props }: BadgeProps) {
  const dot = variant ? dotColor[variant] : undefined;
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className={cn('size-1.5 rounded-pill', dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
