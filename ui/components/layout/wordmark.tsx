import { cn } from '@/lib/utils';

/**
 * The wordmark. Set in the display serif at weight 300 -- the same
 * editorial voice as every headline, rather than the bold sans lockup the
 * old UI used (which read as a generic SaaS logo and fought the type
 * system everywhere it appeared).
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
        'font-display text-title-md tracking-tight',
        onDark ? 'text-on-dark' : 'text-ink',
        className
      )}
      style={{ fontWeight: 300 }}
    >
      Mock<span className="italic">&rsquo;n</span>-Hire
    </span>
  );
}
