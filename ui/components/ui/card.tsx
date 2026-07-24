import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * DESIGN.md "Elevation & Depth": cards float on the off-white canvas via a
 * 1px hairline plus a *single* soft shadow tier. There is deliberately no
 * multi-level shadow scale -- atmospheric depth comes from gradient orbs
 * instead, so more shadow tiers would read as a different design language.
 */
const cardVariants = {
  // `feature-card` -- 16px radius, 24px padding, white, hairline.
  feature: 'bg-surface-card border border-hairline rounded-xl p-lg',
  // `testimonial-card` / `pricing-tier-card` -- roomier 32px padding.
  panel: 'bg-surface-card border border-hairline rounded-xl p-xl',
  // `pricing-tier-featured` -- the dark inversion.
  dark: 'bg-surface-dark text-on-dark border border-transparent rounded-xl p-xl',
  // `gradient-orb-card` -- extra-soft 24px radius on the lighter band.
  orb: 'bg-canvas-soft border border-hairline-soft rounded-xxl p-xl overflow-hidden relative',
  // `product-card-stack` -- children fill edge to edge, so no padding.
  flush: 'bg-surface-card border border-hairline rounded-xl overflow-hidden',
} as const;

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof cardVariants;
  /** Adds the single documented hover lift. Use only for clickable cards. */
  interactive?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'feature', interactive = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        cardVariants[variant],
        interactive &&
          'transition-[box-shadow,border-color] duration-200 hover:shadow-soft hover:border-hairline-strong',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-xs', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    // Component titles are Inter 500 (`title-md`), not display serif --
    // display type is reserved for section-level headlines.
    <h3
      ref={ref}
      className={cn('font-sans text-title-md text-ink', className)}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-body-md text-body', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-sm', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
