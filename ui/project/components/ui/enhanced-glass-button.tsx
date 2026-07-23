"use client"

import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { forwardRef, ReactNode } from "react"
import { Loader2 } from "lucide-react"

interface EnhancedGlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  loading?: boolean
  icon?: ReactNode
  children: ReactNode
  fullWidth?: boolean
}

export const EnhancedGlassButton = forwardRef<HTMLButtonElement, EnhancedGlassButtonProps>(
  ({ 
    className, 
    variant = 'default', 
    size = 'md', 
    loading = false, 
    disabled, 
    icon,
    children, 
    fullWidth = false,
    ...props 
  }, ref) => {
    const baseClasses = "relative inline-flex items-center justify-center font-medium transition-all duration-200 focus-ring disabled:opacity-50 disabled:cursor-not-allowed"
    
    const variants = {
      default: "glass-button text-foreground hover:bg-accent/50",
      primary: "glass-button-primary",
      secondary: "glass-button-secondary", 
      outline: "border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground bg-transparent",
      ghost: "text-foreground hover:bg-accent hover:text-accent-foreground bg-transparent border-transparent",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 border-destructive/20"
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
        {/* Loading spinner */}
        {loading && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mr-2"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
          </motion.div>
        )}
        
        {/* Icon */}
        {icon && !loading && (
          <span className="mr-2 flex items-center">
            {icon}
          </span>
        )}
        
        {/* Button text */}
        <span className={loading ? "opacity-70" : ""}>
          {children}
        </span>

        {/* Ripple effect */}
        <motion.div
          className="absolute inset-0 rounded-inherit bg-white/20 opacity-0"
          whileTap={{ opacity: [0, 0.3, 0] }}
          transition={{ duration: 0.3 }}
        />
      </motion.button>
    )
  }
)

EnhancedGlassButton.displayName = "EnhancedGlassButton"