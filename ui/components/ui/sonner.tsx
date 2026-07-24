'use client';

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toast surface.
 *
 * Was wired to next-themes' useTheme() and styled with `bg-background` /
 * `text-foreground` / `border-border`. Both are dead now: there is no theme
 * provider (one fixed canvas), and those CSS variables no longer exist in
 * the token set, so every one of those classes compiled to nothing and
 * toasts rendered unstyled.
 */
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="light"
    className="toaster group"
    toastOptions={{
      classNames: {
        toast:
          'group toast rounded-lg border border-hairline bg-surface-card text-ink shadow-soft font-sans',
        title: 'text-body-strong',
        description: 'group-[.toast]:text-body',
        actionButton:
          'group-[.toast]:bg-ink-primary group-[.toast]:text-on-primary group-[.toast]:rounded-pill',
        cancelButton:
          'group-[.toast]:bg-surface-strong group-[.toast]:text-ink group-[.toast]:rounded-pill',
        error: 'group-[.toaster]:text-error',
        success: 'group-[.toaster]:text-ink',
      },
    }}
    {...props}
  />
);

export { Toaster };
