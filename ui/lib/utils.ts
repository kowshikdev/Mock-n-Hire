import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Plain `twMerge` only recognizes Tailwind's *default* class scales. It has
 * no way to know that this project's `tailwind.config.ts` adds custom
 * `text-*` tokens for both font size (`text-button`, `text-caption`, ...)
 * and text color (`text-on-primary`, `text-ink`, ...) -- so any `text-*`
 * class it doesn't recognize falls into one generic fallback group, and a
 * "last one wins" conflict resolution kicks in across ALL of them together.
 *
 * button.tsx's `cva` output stacks exactly three: a font-size class from the
 * base styles (`text-button`), a color class from the variant
 * (`text-on-primary`), and for `size="sm"` a font-size override
 * (`text-caption`). Unconfigured twMerge saw all three as one conflict and
 * kept only the last -- `text-caption` -- silently dropping
 * `text-on-primary` entirely. Every `size="sm"` primary button rendered with
 * no explicit text color, falling back to the inherited body color (#4e4e4e)
 * on a near-black pill: the "Get started" button that was reported
 * completely unreadable, confirmed via the actual rendered DOM className
 * (`text-on-primary` and `text-button` both absent, only `text-caption`
 * survived).
 *
 * Registering the custom scales as their own class groups tells twMerge
 * font-size and color are different concerns, so a size class no longer
 * evicts a color class.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display-mega', 'display-xl', 'display-lg', 'display-md', 'display-sm',
            'title-md', 'title-sm',
            'body-md', 'body-strong', 'body-sm',
            'caption', 'caption-upper',
            'button', 'nav-link',
          ],
        },
      ],
      'text-color': [
        {
          text: [
            'ink', 'ink-primary', 'ink-active',
            'body',
            'muted', 'muted-soft',
            'canvas', 'canvas-soft', 'canvas-deep',
            'surface-card', 'surface-strong', 'surface-dark', 'surface-dark-elevated',
            'hairline', 'hairline-soft', 'hairline-strong',
            'on-primary', 'on-dark', 'on-dark-soft',
            'success', 'error',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
