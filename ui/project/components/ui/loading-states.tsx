"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Loader2, Brain } from "lucide-react"

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6', 
    lg: 'w-8 h-8'
  }

  return (
    <motion.div
      className={cn(
        "animate-spin text-primary",
        sizeClasses[size],
        className
      )}
      animate={{ rotate: 360 }}
      transition={{
        duration: 1,
        repeat: Infinity,
        ease: "linear"
      }}
    >
      <Loader2 className="w-full h-full" />
    </motion.div>
  )
}

interface LoadingSkeletonProps {
  className?: string
  lines?: number
}

export function LoadingSkeleton({ className, lines = 1 }: LoadingSkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <motion.div
          key={i}
          className="h-4 bg-muted rounded loading-shimmer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.1 }}
        />
      ))}
    </div>
  )
}

interface LoadingCardProps {
  className?: string
}

export function LoadingCard({ className }: LoadingCardProps) {
  return (
    <div className={cn("glass-card p-6 space-y-4", className)}>
      <div className="flex items-center space-x-4">
        <div className="w-12 h-12 bg-muted rounded-lg loading-shimmer" />
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-muted rounded loading-shimmer w-3/4" />
          <div className="h-3 bg-muted rounded loading-shimmer w-1/2" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-muted rounded loading-shimmer" />
        <div className="h-3 bg-muted rounded loading-shimmer w-5/6" />
        <div className="h-3 bg-muted rounded loading-shimmer w-4/6" />
      </div>
    </div>
  )
}

interface FullPageLoadingProps {
  message?: string
}

export function FullPageLoading({ message = "Loading..." }: FullPageLoadingProps) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center space-y-6"
      >
        <motion.div
          className="w-16 h-16 mx-auto rounded-xl gradient-bg flex items-center justify-center"
          animate={{ 
            scale: [1, 1.1, 1],
            rotate: [0, 180, 360]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <Brain className="w-8 h-8 text-white" />
        </motion.div>
        
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">{message}</h3>
          <div className="flex items-center justify-center space-x-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-primary rounded-full"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.5, 1, 0.5]
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.2
                }}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

interface ProcessingAnimationProps {
  steps: string[]
  currentStep: number
  className?: string
}

export function ProcessingAnimation({ steps, currentStep, className }: ProcessingAnimationProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="text-center">
        <motion.div
          className="w-20 h-20 mx-auto rounded-xl gradient-bg flex items-center justify-center mb-4"
          animate={{ rotate: 360 }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "linear"
          }}
        >
          <Brain className="w-10 h-10 text-white" />
        </motion.div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Processing</h3>
        <p className="text-muted-foreground">Please wait while we analyze your data</p>
      </div>

      <div className="space-y-3">
        {steps.map((step, index) => (
          <motion.div
            key={index}
            className="flex items-center space-x-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
              index < currentStep 
                ? "bg-green-500 text-white" 
                : index === currentStep
                ? "bg-primary text-primary-foreground animate-pulse"
                : "bg-muted text-muted-foreground"
            )}>
              {index < currentStep ? "✓" : index + 1}
            </div>
            <span className={cn(
              "text-sm",
              index <= currentStep ? "text-foreground" : "text-muted-foreground"
            )}>
              {step}
            </span>
            {index === currentStep && (
              <LoadingSpinner size="sm" />
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}