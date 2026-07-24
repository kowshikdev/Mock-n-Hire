import { cn } from '@/lib/utils';

/**
 * The wordmark.
 *
 * Set in the display serif, but at weight 500 rather than the 300 used for
 * headlines. DESIGN.md's "display stays at 300" rule is about *display
 * copy* -- long headline text, where 300 reads as editorial restraint. A
 * 20px logo is not display copy: at that size Cormorant Garamond 300 has
 * strokes thin enough to look washed out and under-set against the canvas,
 * which is exactly how it shipped. 500 keeps the serif voice while giving
 * the mark enough weight to hold its own in a 64px nav bar.
 */
export function Wordmark({
  className,
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <span
      className={cn(
        'font-display text-[22px] leading-none tracking-tight',
        onDark ? 'text-on-dark' : 'text-ink',
        className
      )}
      style={{ fontWeight: 500 }}
    >
      Mock<span className="italic">&rsquo;n</span>-Hire
    </span>
  );
}
