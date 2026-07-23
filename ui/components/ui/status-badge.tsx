"use client"

import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { CheckCircle, Clock, AlertCircle, XCircle, Loader2 } from "lucide-react"

interface StatusBadgeProps {
  status: 'success' | 'warning' | 'error' | 'info' | 'pending' | 'loading'
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outline' | 'solid'
  animate?: boolean
  className?: string
}

const statusConfig = {
  success: {
    icon: CheckCircle,
    classes: "status-success",
    solidClasses: "bg-green-500 text-white border-green-500"
  },
  warning: {
    icon: AlertCircle,
    classes: "status-warning",
    solidClasses: "bg-yellow-500 text-white border-yellow-500"
  },
  error: {
    icon: XCircle,
    classes: "status-error",
    solidClasses: "bg-red-500 text-white border-red-500"
  },
  info: {
    icon: AlertCircle,
    classes: "status-info",
    solidClasses: "bg-blue-500 text-white border-blue-500"
  },
  pending: {
    icon: Clock,
    classes: "bg-gray-500/10 text-gray-600 border-gray-500/20",
    solidClasses: "bg-gray-500 text-white border-gray-500"
  },
  loading: {
    icon: Loader2,
    classes: "bg-primary/10 text-primary border-primary/20",
    solidClasses: "bg-primary text-primary-foreground border-primary"
  }
}

const sizeConfig = {
  sm: {
    container: "px-2 py-1 text-xs",
    icon: "w-3 h-3"
  },
  md: {
    container: "px-3 py-1.5 text-sm",
    icon: "w-4 h-4"
  },
  lg: {
    container: "px-4 py-2 text-base",
    icon: "w-5 h-5"
  }
}

export function StatusBadge({ 
  status, 
  children, 
  size = 'md', 
  variant = 'default',
  animate = true,
  className 
}: StatusBadgeProps) {
  const config = statusConfig[status]
  const sizeStyles = sizeConfig[size]
  const Icon = config.icon

  const baseClasses = cn(
    "inline-flex items-center gap-1.5 rounded-full font-medium border transition-all duration-200",
    sizeStyles.container
  )

  const variantClasses = {
    default: config.classes,
    outline: `border-2 ${config.classes}`,
    solid: config.solidClasses
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
      <Icon 
        className={cn(
          sizeStyles.icon,
          status === 'loading' && "animate-spin"
        )} 
      />
      {children}
    </Component>
  )
}

interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'busy' | 'away'
  size?: 'sm' | 'md' | 'lg'
  animate?: boolean
  className?: string
}

export function StatusIndicator({ 
  status, 
  size = 'md', 
  animate = true,
  className 
}: StatusIndicatorProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  }

  const statusClasses = {
    online: 'bg-green-500',
    offline: 'bg-gray-400',
    busy: 'bg-red-500',
    away: 'bg-yellow-500'
  }

  const Component = animate ? motion.div : "div"

  return (
    <Component
      className={cn(
        "rounded-full border-2 border-background",
        sizeClasses[size],
        statusClasses[status],
        className
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
  )
}