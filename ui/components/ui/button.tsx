'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * DESIGN.md defines exactly three button forms, and is explicit that the
 * near-black ink pill is the *only* CTA color -- there is no saturated brand
 * action color to reach for. Destructive actions therefore stay ink-shaped
 * and carry semantic red only on the label/border, not as a filled surface.
 *
 * Every variant is pill-shaped: "Don't use sharp 0px on CTAs."
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill text-button ' +
    'transition-[background-color,border-color,color,opacity] duration-200 ' +
    'disabled:pointer-events-none disabled:opacity-40 ' +
    '[&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-ink-primary text-on-primary hover:bg-ink-active',
        outline:
          'border border-hairline-strong bg-transparent text-ink hover:border-ink hover:bg-surface-strong',
        ghost: 'bg-transparent text-ink hover:bg-surface-strong',
        // Inline text link -- DESIGN.md `button-tertiary-text`.
        text: 'bg-transparent text-ink underline-offset-4 hover:underline px-0 h-auto',
        // Inverted, for use on the dark CTA band / featured pricing tier.
        onDark: 'bg-surface-card text-ink hover:bg-canvas',
        destructive:
          'border border-error/40 bg-transparent text-error hover:bg-error hover:text-on-primary hover:border-error',
      },
      size: {
        // 40px is the documented CTA height.
        default: 'h-10 px-5',
        sm: 'h-9 px-4 text-caption',
        lg: 'h-12 px-7',
        icon: 'h-10 w-10 px-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
