"use client"

import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { forwardRef, ReactNode } from "react"
import { Loader2 } from "lucide-react"

interface ModernButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success' | 'warning'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  loading?: boolean
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
  children: ReactNode
  fullWidth?: boolean
  gradient?: boolean
}

export const ModernButton = forwardRef<HTMLButtonElement, ModernButtonProps>(
  ({ 
    className, 
    variant = 'default', 
    size = 'md', 
    loading = false, 
    disabled, 
    icon,
    iconPosition = 'left',
    children, 
    fullWidth = false,
    gradient = false,
    ...props 
  }, ref) => {
    const baseClasses = "relative inline-flex items-center justify-center font-medium transition-all duration-200 focus-ring disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group"
    
    const variants = {
      default: "glass-button",
      primary: gradient ? "glass-button-primary" : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg hover:shadow-xl",
      secondary: "glass-button-secondary",
      outline: "glass-button-outline",
      ghost: "glass-button-ghost",
      destructive: "glass-button-destructive",
      success: "glass-button-success",
      warning: "glass-button-warning"
    }
    
    const sizes = {
      sm: "px-3 py-1.5 text-sm rounded-md h-8",
      md: "px-4 py-2 text-sm rounded-lg h-10", 
      lg: "px-6 py-3 text-base rounded-lg h-12",
      xl: "px-8 py-4 text-lg rounded-xl h-14"
    }

    const isDisabled = disabled || loading

    return (
      <motion.button
        ref={ref}
        className={cn(
          baseClasses,
          variants[variant],
          sizes[size],
          fullWidth && "w-full",
          className
        )}
        whileHover={!isDisabled ? { scale: 1.02 } : {}}
        whileTap={!isDisabled ? { scale: 0.98 } : {}}
        disabled={isDisabled}
        {...props}
      >
        {/* Ripple effect */}
        <motion.div
          className="absolute inset-0 bg-white/20 rounded-inherit"
          initial={{ scale: 0, opacity: 0 }}
          whileTap={{ scale: 2, opacity: [0, 0.3, 0] }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Loading spinner */}
        {loading && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              "flex items-center",
              iconPosition === 'left' ? "mr-2" : "ml-2"
            )}
          >
            <Loader2 className="w-4 h-4 animate-spin" />
          </motion.div>
        )}
        
        {/* Left icon */}
        {icon && !loading && iconPosition === 'left' && (
          <span className="mr-2 flex items-center">
            {icon}
          </span>
        )}
        
        {/* Button text */}
        <span className={cn(
          "relative z-10 transition-all duration-200",
          loading && "opacity-70"
        )}>
          {children}
        </span>

        {/* Right icon */}
        {icon && !loading && iconPosition === 'right' && (
          <span className="ml-2 flex items-center">
            {icon}
          </span>
        )}

        {/* Hover gradient overlay */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          initial={{ x: '-100%' }}
          whileHover={{ x: '100%' }}
          transition={{ duration: 0.6 }}
        />
      </motion.button>
    )
  }
)

ModernButton.displayName = "ModernButton"
