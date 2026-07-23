"use client"

import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { CheckCircle, Clock, AlertCircle, XCircle, Loader2, Info } from "lucide-react"

interface StatusIndicatorProps {
  status: 'success' | 'warning' | 'error' | 'info' | 'pending' | 'loading'
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outline' | 'solid' | 'ghost'
  animate?: boolean
  className?: string
  showIcon?: boolean
}

const statusConfig = {
  success: {
    icon: CheckCircle,
    classes: "bg-green-500/10 text-green-600 border-green-500/20 dark:bg-green-500/20 dark:text-green-400 dark:border-green-500/30",
    solidClasses: "bg-green-500 text-white border-green-500",
    ghostClasses: "text-green-600 hover:bg-green-500/10 dark:text-green-400"
  },
  warning: {
    icon: AlertCircle,
    classes: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/30",
    solidClasses: "bg-yellow-500 text-white border-yellow-500",
    ghostClasses: "text-yellow-600 hover:bg-yellow-500/10 dark:text-yellow-400"
  },
  error: {
    icon: XCircle,
    classes: "bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30",
    solidClasses: "bg-red-500 text-white border-red-500",
    ghostClasses: "text-red-600 hover:bg-red-500/10 dark:text-red-400"
  },
  info: {
    icon: Info,
    classes: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30",
    solidClasses: "bg-blue-500 text-white border-blue-500",
    ghostClasses: "text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
  },
  pending: {
    icon: Clock,
    classes: "bg-gray-500/10 text-gray-600 border-gray-500/20 dark:bg-gray-500/20 dark:text-gray-400 dark:border-gray-500/30",
    solidClasses: "bg-gray-500 text-white border-gray-500",
    ghostClasses: "text-gray-600 hover:bg-gray-500/10 dark:text-gray-400"
  },
  loading: {
    icon: Loader2,
    classes: "bg-primary/10 text-primary border-primary/20",
    solidClasses: "bg-primary text-primary-foreground border-primary",
    ghostClasses: "text-primary hover:bg-primary/10"
  }
}

const sizeConfig = {
  sm: {
    container: "px-2 py-1 text-xs gap-1",
    icon: "w-3 h-3"
  },
  md: {
    container: "px-3 py-1.5 text-sm gap-1.5",
    icon: "w-4 h-4"
  },
  lg: {
    container: "px-4 py-2 text-base gap-2",
    icon: "w-5 h-5"
  }
}

export function StatusIndicator({ 
  status, 
  children, 
  size = 'md', 
  variant = 'default',
  animate = true,
  className,
  showIcon = true
}: StatusIndicatorProps) {
  const config = statusConfig[status]
  const sizeStyles = sizeConfig[size]
  const Icon = config.icon

  const baseClasses = cn(
    "inline-flex items-center rounded-full font-medium border transition-all duration-200",
    sizeStyles.container
  )

  const variantClasses = {
    default: config.classes,
    outline: `border-2 ${config.classes}`,
    solid: config.solidClasses,
    ghost: `border-transparent ${config.ghostClasses}`
  }

  const Component = animate ? motion.span : "span"

  return (
    <Component
      className={cn(
        baseClasses,
        variantClasses[variant],
        className
      )}
      {...(animate && {
        initial: { opacity: 0, scale: 0.8 },
        animate: { opacity: 1, scale: 1 },
        transition: { duration: 0.2 }
      })}
    >
      {showIcon && (
        <Icon 
          className={cn(
            sizeStyles.icon,
            status === 'loading' && "animate-spin"
          )} 
        />
      )}
      {children}
    </Component>
  )
}

interface ActivityIndicatorProps {
  status: 'online' | 'offline' | 'busy' | 'away' | 'idle'
  size?: 'sm' | 'md' | 'lg'
  animate?: boolean
  className?: string
  label?: string
}

export function ActivityIndicator({ 
  status, 
  size = 'md', 
  animate = true,
  className,
  label
}: ActivityIndicatorProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  }

  const statusStyles = {
    online: 'bg-green-500',
    offline: 'bg-gray-400',
    busy: 'bg-red-500',
    away: 'bg-yellow-500',
    idle: 'bg-orange-500'
  }

  const Component = animate ? motion.div : "div"

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative">
        <Component
          className={cn(
            "rounded-full border-2 border-background shadow-sm",
            sizeClasses[size],
            statusStyles[status]
          )}
          {...(animate && status === 'online' && {
            animate: {
              scale: [1, 1.2, 1],
              opacity: [1, 0.8, 1]
            },
            transition: {
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }
          })}
        />
        {animate && status === 'online' && (
          <motion.div
            className={cn(
              "absolute inset-0 rounded-full bg-green-500",
              sizeClasses[size]
            )}
            animate={{
              scale: [1, 2, 1],
              opacity: [0.5, 0, 0.5]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        )}
      </div>
      {label && (
        <span className="text-sm text-muted-foreground capitalize">
          {label || status}
        </span>
      )}
    </div>
  )
}

interface ProgressIndicatorProps {
  value: number
  max?: number
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'success' | 'warning' | 'error'
  showLabel?: boolean
  animate?: boolean
  className?: string
}

export function ProgressIndicator({
  value,
  max = 100,
  size = 'md',
  variant = 'default',
  showLabel = true,
  animate = true,
  className
}: ProgressIndicatorProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  
  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  }

  const variantClasses = {
    default: 'bg-primary',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500'
  }

  return (
    <div className={cn("space-y-2", className)}>
      {showLabel && (
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-foreground">Progress</span>
          <span className="text-sm text-muted-foreground">{Math.round(percentage)}%</span>
        </div>
      )}
      <div className={cn(
        "w-full bg-secondary rounded-full overflow-hidden",
        sizeClasses[size]
      )}>
        <motion.div
          className={cn(
            "h-full rounded-full transition-colors duration-200",
            variantClasses[variant]
          )}
          initial={animate ? { width: 0 } : { width: `${percentage}%` }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  )
}
