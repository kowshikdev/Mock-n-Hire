"use client"

import { cn } from "@/lib/utils"
import { forwardRef, ReactNode, useState } from "react"
import { motion } from "framer-motion"
import { Eye, EyeOff } from "lucide-react"

interface EnhancedGlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: ReactNode
  rightIcon?: ReactNode
  variant?: 'default' | 'filled' | 'outlined'
}

export const EnhancedGlassInput = forwardRef<HTMLInputElement, EnhancedGlassInputProps>(
  ({ 
    className, 
    label, 
    error, 
    hint, 
    icon, 
    rightIcon, 
    variant = 'default',
    type,
    ...props 
  }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    const [isFocused, setIsFocused] = useState(false)
    
    const isPassword = type === 'password'
    const inputType = isPassword && showPassword ? 'text' : type

    const variantClasses = {
      default: 'glass-input',
      filled: 'bg-accent/50 border-transparent focus:border-primary/50',
      outlined: 'bg-transparent border-2 border-border focus:border-primary'
    }

    return (
      <div className="space-y-2">
        {/* Label */}
        {label && (
          <motion.label 
            className={cn(
              "block text-sm font-medium transition-colors duration-200",
              error ? "text-destructive" : "text-foreground",
              isFocused && "text-primary"
            )}
            initial={{ opacity: 0.7 }}
            animate={{ opacity: isFocused ? 1 : 0.7 }}
          >
            {label}
          </motion.label>
        )}
        
        {/* Input Container */}
        <div className="relative">
          {/* Left Icon */}
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {icon}
            </div>
          )}
          
          {/* Input */}
          <motion.input
            ref={ref}
            type={inputType}
            className={cn(
              variantClasses[variant],
              "w-full transition-all duration-200",
              icon && "pl-10",
              (rightIcon || isPassword) && "pr-10",
              error && "border-destructive focus:border-destructive focus:ring-destructive/20",
              className
            )}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            whileFocus={{ scale: 1.01 }}
            {...props}
          />
          
          {/* Right Icon or Password Toggle */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isPassword ? (
              <motion.button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-muted-foreground hover:text-foreground transition-colors focus-ring rounded p-1"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </motion.button>
            ) : rightIcon ? (
              <div className="text-muted-foreground">
                {rightIcon}
              </div>
            ) : null}
          </div>

          {/* Focus Ring Animation */}
          <motion.div
            className="absolute inset-0 rounded-inherit border-2 border-primary pointer-events-none"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ 
              opacity: isFocused ? 0.2 : 0,
              scale: isFocused ? 1.02 : 1
            }}
            transition={{ duration: 0.2 }}
          />
        </div>
        
        {/* Error Message */}
        {error && (
          <motion.p 
            className="text-sm text-destructive flex items-center gap-1"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="w-1 h-1 rounded-full bg-destructive" />
            {error}
          </motion.p>
        )}
        
        {/* Hint */}
        {hint && !error && (
          <p className="text-sm text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    )
  }
)

EnhancedGlassInput.displayName = "EnhancedGlassInput"