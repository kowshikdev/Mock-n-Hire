"use client"

import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { forwardRef, ReactNode } from "react"

interface ModernCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
  interactive?: boolean
  gradient?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'elevated' | 'bordered' | 'ghost'
}

export const ModernCard = forwardRef<HTMLDivElement, ModernCardProps>(
  ({ 
    className, 
    children,
    hover = true,
    interactive = false,
    gradient = false,
    size = 'md',
    variant = 'default',
    ...props 
  }, ref) => {const Component = (hover || interactive) ? motion.div : "div"
    
    const sizeClasses = {
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8'
    }

    const variantClasses = {
      default: 'glass-card',
      elevated: 'glass-card shadow-2xl',
      bordered: 'glass-card border-2 border-primary/20',
      ghost: 'bg-transparent border border-border/50'
    }
    
    return (
      <Component
        ref={ref}
        className={cn(
          variantClasses[variant],
          sizeClasses[size],
          interactive && "cursor-pointer",
          gradient && "relative overflow-hidden",
          className
        )}
        {...(hover && {
          whileHover: { 
            scale: 1.02,
            y: -4,
            transition: { duration: 0.2 }
          }
        })}
        {...(interactive && {
          whileTap: { scale: 0.98 },
          transition: { duration: 0.2 }
        })}
        {...props}
      >
        {gradient && (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-accent/5 to-transparent pointer-events-none" />
          </>
        )}
        
        <div className="relative z-10">
          {children}
        </div>

        {/* Hover border effect */}
        {hover && (
          <motion.div
            className="absolute inset-0 rounded-inherit border-2 border-primary/0"
            whileHover={{ borderColor: 'hsl(var(--primary) / 0.3)' }}
            transition={{ duration: 0.2 }}
          />
        )}
      </Component>
    )
  }
)

ModernCard.displayName = "ModernCard"

export const ModernCardHeader = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 pb-4", className)}
    {...props}
  />
))
ModernCardHeader.displayName = "ModernCardHeader"

export const ModernCardTitle = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("heading-4 text-foreground", className)}
    {...props}
  />
))
ModernCardTitle.displayName = "ModernCardTitle"

export const ModernCardDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("body-small text-muted-foreground", className)}
    {...props}
  />
))
ModernCardDescription.displayName = "ModernCardDescription"

export const ModernCardContent = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("", className)} {...props} />
))
ModernCardContent.displayName = "ModernCardContent"

export const ModernCardFooter = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center pt-4", className)}
    {...props}
  />
))
ModernCardFooter.displayName = "ModernCardFooter"
