"use client"

import { cn } from "@/lib/utils"
import { forwardRef, ReactNode, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Eye, EyeOff, AlertCircle, CheckCircle } from "lucide-react"

interface ModernInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  success?: string
  icon?: ReactNode
  rightIcon?: ReactNode
  variant?: 'default' | 'filled' | 'outlined' | 'glass'
  inputSize?: 'sm' | 'md' | 'lg'
}

export const ModernInput = forwardRef<HTMLInputElement, ModernInputProps>(
  ({ 
    className, 
    label, 
    error, 
    hint, 
    success,
    icon, 
    rightIcon, 
    variant = 'glass',
    inputSize = 'md',
    type,
    ...props 
  }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    const [isFocused, setIsFocused] = useState(false)
    
    const isPassword = type === 'password'
    const inputType = isPassword && showPassword ? 'text' : type

    const sizeClasses = {
      sm: 'px-3 py-2 text-sm h-9',
      md: 'px-4 py-3 text-sm h-10',
      lg: 'px-5 py-4 text-base h-12'
    }

    const variantClasses = {
      default: 'border border-border bg-background focus:border-primary focus:ring-primary/20',
      filled: 'bg-accent/50 border-transparent focus:border-primary/50 focus:bg-background',
      outlined: 'bg-transparent border-2 border-border focus:border-primary',
      glass: 'glass-input'
    }

    return (
      <div className="space-y-2">
        {/* Label */}
        {label && (
          <motion.label 
            className={cn(
              "block text-sm font-medium transition-colors duration-200",
              error ? "text-destructive" : success ? "text-green-600" : "text-foreground",
              isFocused && !error && !success && "text-primary"
            )}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: isFocused ? 1 : 0.8 }}
          >
            {label}
            {props.required && <span className="text-destructive ml-1">*</span>}
          </motion.label>
        )}
        
        {/* Input Container */}
        <div className="relative">
          {/* Left Icon */}
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              {icon}
            </div>
          )}
          
          {/* Input */}
          <motion.input
            ref={ref}
            type={inputType}
            className={cn(
              variantClasses[variant],
              sizeClasses[inputSize],
              "w-full rounded-lg transition-all duration-200 focus:outline-none focus:ring-2",
              icon && "pl-10",
              (rightIcon || isPassword || error || success) && "pr-10",
              error && "border-destructive focus:border-destructive focus:ring-destructive/20",
              success && "border-green-500 focus:border-green-500 focus:ring-green-500/20",
              className
            )}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={
              error ? `${props.id}-error` : 
              success ? `${props.id}-success` : 
              hint ? `${props.id}-hint` : undefined
            }
            {...props}
          />
          
          {/* Right Icons */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {/* Status Icons */}
            {error && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-destructive"
              >
                <AlertCircle className="w-4 h-4" />
              </motion.div>
            )}
            
            {success && !error && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-green-600"
              >
                <CheckCircle className="w-4 h-4" />
              </motion.div>
            )}

            {/* Password Toggle */}
            {isPassword && (
              <motion.button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-muted-foreground hover:text-foreground transition-colors focus-ring rounded p-1 ml-1"
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
            )}

            {/* Custom Right Icon */}
            {rightIcon && !isPassword && !error && !success && (
              <div className="text-muted-foreground">
                {rightIcon}
              </div>
            )}
          </div>

          {/* Focus Ring Animation */}
          <motion.div
            className="absolute inset-0 rounded-lg border-2 border-primary pointer-events-none"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ 
              opacity: isFocused && !error ? 0.2 : 0,
              scale: isFocused ? 1.02 : 1
            }}
            transition={{ duration: 0.2 }}
          />
        </div>
        
        {/* Messages */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-1 text-sm text-destructive"
              id={`${props.id}-error`}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
          
          {success && !error && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-1 text-sm text-green-600"
              id={`${props.id}-success`}
            >
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>{success}</span>
            </motion.div>
          )}
          
          {hint && !error && !success && (
            <motion.div
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-muted-foreground"
              id={`${props.id}-hint`}
            >
              {hint}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }
)

ModernInput.displayName = "ModernInput"
