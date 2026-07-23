"use client"

import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { forwardRef, ReactNode } from "react"

interface EnhancedGlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  gradient?: boolean
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'elevated' | 'bordered'
}

export const EnhancedGlassCard = forwardRef<HTMLDivElement, EnhancedGlassCardProps>(
  ({ 
    className, 
    hover = true, 
    gradient = false,
    size = 'md',
    variant = 'default',
    children, 
    ...props 
  }, ref) => {
    const Component = hover ? motion.div : "div"
    
    const sizeClasses = {
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8'
    }

    const variantClasses = {
      default: 'glass-card',
      elevated: 'glass-card shadow-2xl',
      bordered: 'glass-card border-2 border-primary/20'
    }
    
    return (
      <Component
        ref={ref}
        className={cn(
          variantClasses[variant],
          sizeClasses[size],
          gradient && "relative overflow-hidden",
          className
        )}
        {...(hover && {
          whileHover: { 
            scale: 1.02,
            y: -4,
            transition: { duration: 0.2 }
          },
          whileTap: { scale: 0.98 },
          transition: { duration: 0.2 }
        })}
        {...props}
      >
        {gradient && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
        )}
        <div className="relative z-10">
          {children}
        </div>
      </Component>
    )
  }
)

EnhancedGlassCard.displayName = "EnhancedGlassCard"