'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * DESIGN.md `text-input`: white surface, 8px radius, 44px tall, 1px strong
 * hairline, and on focus "border thickens to 2px ink".
 *
 * The 2px focus border is implemented as a ring rather than a real border so
 * the control does not shift by 1px when focused.
 */
const fieldBase =
  'w-full bg-surface-card text-ink text-body-md rounded-md border border-hairline-strong ' +
  'placeholder:text-muted-soft transition-[border-color,box-shadow] duration-150 ' +
  'focus-visible:outline-none focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        fieldBase,
        'h-11 px-base',
        'file:border-0 file:bg-transparent file:text-caption file:text-ink',
        invalid && 'border-error focus-visible:border-error focus-visible:ring-error',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        fieldBase,
        'min-h-[120px] px-base py-sm resize-y',
        invalid && 'border-error focus-visible:border-error focus-visible:ring-error',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('block text-body-strong text-ink', className)}
      {...props}
    />
  )
);
Label.displayName = 'Label';

/** Field wrapper: label + control + optional hint/error, consistently spaced. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-xs', className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? (
        <p className="text-caption text-error">{error}</p>
      ) : hint ? (
        <p className="text-caption text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export { Input, Textarea, Label };
