import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Layout rhythm primitives. DESIGN.md specifies a 96px section rhythm and a
 * 1200px content cap; encoding both here keeps pages from re-deriving the
 * padding scale (which is how the old UI ended up with a dozen different
 * container widths).
 */

export function Section({
  children,
  className,
  tone = 'canvas',
  ...props
}: React.HTMLAttributes<HTMLElement> & { tone?: 'canvas' | 'soft' | 'dark' }) {
  return (
    <section
      className={cn(
        'section-band relative',
        tone === 'canvas' && 'bg-canvas',
        tone === 'soft' && 'bg-canvas-soft',
        tone === 'dark' && 'bg-surface-dark text-on-dark',
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function Container({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('container-content relative', className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Section heading: optional uppercase eyebrow, display headline, body lede.
 * `as` lets callers keep a sane document outline (h1 on hero, h2 elsewhere)
 * without changing the visual size.
 */
export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = 'left',
  size = 'lg',
  as: Tag = 'h2',
  onDark = false,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  align?: 'left' | 'center';
  size?: 'mega' | 'xl' | 'lg' | 'md';
  as?: 'h1' | 'h2' | 'h3';
  onDark?: boolean;
  className?: string;
}) {
  const sizeClass = {
    mega: 'text-display-md md:text-display-xl lg:text-display-mega',
    xl: 'text-display-md md:text-display-xl',
    lg: 'text-display-md md:text-display-lg',
    md: 'text-display-sm md:text-display-md',
  }[size];

  return (
    <div
      className={cn(
        'flex flex-col gap-base',
        align === 'center' && 'items-center text-center',
        align === 'center' && 'mx-auto max-w-2xl',
        className
      )}
    >
      {eyebrow && (
        <span className={cn('eyebrow', onDark && 'text-on-dark-soft')}>{eyebrow}</span>
      )}
      <Tag className={cn('font-display', sizeClass, onDark ? 'text-on-dark' : 'text-ink')}>
        {title}
      </Tag>
      {lede && (
        <p
          className={cn(
            'text-body-md max-w-2xl',
            onDark ? 'text-on-dark-soft' : 'text-body'
          )}
        >
          {lede}
        </p>
      )}
    </div>
  );
}
