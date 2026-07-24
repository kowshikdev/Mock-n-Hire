import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The atmospheric gradient orb -- DESIGN.md calls this "the brand's
 * strongest atmospheric pattern" and the only place color appears.
 *
 * Hard rules encoded here, from DESIGN.md "Don'ts":
 *   - Orbs are PURE DECORATION. They never contain content, never fill a
 *     button, never color text.
 *   - They must never intercept interaction, so every orb is
 *     `pointer-events-none` and `aria-hidden`.
 *   - They "reduce diameter at every breakpoint but never disappear".
 *
 * Motion respects `prefers-reduced-motion` via the `.orb-drift` class in
 * globals.css, which only animates when reduced motion is not requested.
 */

const ORB_TINT = {
  mint: '#a7e5d3',
  peach: '#f4c5a8',
  lavender: '#c8b8e0',
  sky: '#a8c8e8',
  rose: '#e8b8c4',
} as const;

export type OrbTint = keyof typeof ORB_TINT;

export interface OrbProps {
  tint: OrbTint;
  /** Diameter at desktop. Shrinks proportionally on small screens. */
  size?: number;
  className?: string;
  /** Opacity 0-1. Defaults to the documented soft atmospheric level. */
  opacity?: number;
  drift?: boolean;
}

export function Orb({
  tint,
  size = 420,
  className,
  opacity = 0.5,
  drift = true,
}: OrbProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute rounded-pill',
        drift && 'orb-drift',
        className
      )}
      style={{
        width: size,
        height: size,
        maxWidth: '80vw',
        maxHeight: '80vw',
        opacity,
        background: `radial-gradient(circle at 50% 50%, ${ORB_TINT[tint]} 0%, ${ORB_TINT[tint]}00 70%)`,
        filter: 'blur(48px)',
      }}
    />
  );
}

/**
 * A positioned cluster of orbs for hero / CTA bands. Kept as its own
 * component so pages don't hand-place magic coordinates repeatedly.
 */
export function OrbField({
  variant = 'hero',
  className,
}: {
  variant?: 'hero' | 'band' | 'corner';
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      {variant === 'hero' && (
        <>
          <Orb tint="mint" size={520} className="-top-32 -left-24" opacity={0.45} />
          <Orb tint="peach" size={460} className="top-10 right-0" opacity={0.4} />
          <Orb tint="lavender" size={400} className="bottom-0 left-1/3" opacity={0.35} />
        </>
      )}
      {variant === 'band' && (
        <>
          <Orb tint="sky" size={380} className="-top-20 right-10" opacity={0.35} />
          <Orb tint="rose" size={340} className="-bottom-24 left-0" opacity={0.3} />
        </>
      )}
      {variant === 'corner' && (
        <Orb tint="lavender" size={320} className="-top-24 -right-16" opacity={0.4} />
      )}
    </div>
  );
}
