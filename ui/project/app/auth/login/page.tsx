"use client"

import { EnhancedGlassButton } from "@/components/ui/enhanced-glass-button"
import { EnhancedGlassCard } from "@/components/ui/enhanced-glass-card"
import { EnhancedGlassInput } from "@/components/ui/enhanced-glass-input"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { useAppStore } from "@/lib/store"
import { signIn, signUp, signInWithGoogle } from "@/lib/auth"
import { motion, AnimatePresence } from "framer-motion"
import { Brain, Chrome, Users, GraduationCap, Mail, Lock, User, ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import Link from "next/link"

export default function AuthPage() {
  const [isSignup, setIsSignup] = useState(false)
  const [role, setRole] = useState<'recruiter' | 'student'>('recruiter')
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    confirmPassword: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  const { setUser } = useAppStore()
  const router = useRouter()

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    if (isSignup) {
      if (!formData.name) {
        newErrors.name = 'Name is required'
      }
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = "Passwords don't match"
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return
    
    setIsLoading(true)
    
    try {
      if (isSignup) {
        const { data, error } = await signUp(formData.email, formData.password, formData.name, role)
        
        if (error) {
          console.error('Signup error:', error)
          toast.error('Failed to create account')
          return
        }

        if (data?.user && data.profile) {
          setUser({
            id: data.profile.user_id,
            email: data.profile.email,
            name: data.profile.name,
            role: data.profile.role
          })
          
          toast.success('Account created successfully!')
          
          await new Promise(resolve => setTimeout(resolve, 1000))
          router.push(`/dashboard/${data.profile.role}`)
        }
      } else {
        const { data, error } = await signIn(formData.email, formData.password)
        
        if (error) {
          console.error('Sign in error:', error)
          toast.error('Invalid email or password')
          return
        }

        if (data?.user && data.profile) {
          setUser({
            id: data.profile.user_id,
            email: data.profile.email,
            name: data.profile.name,
            role: data.profile.role
          })
          
          toast.success('Welcome back!')
          router.push(`/dashboard/${data.profile.role}`)
        }
      }
    } catch (error) {
      console.error('Auth error:', error)
      toast.error('Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleAuth = async () => {
    setIsLoading(true)
    
    try {
      const { error } = await signInWithGoogle()
      
      if (error) {
        toast.error(error.message || 'Failed to sign in with Google')
      }
    } catch (error) {
      console.error('Google auth error:', error)
      toast.error('Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center container-padding py-8">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />
      </div>

      {/* Navigation */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
        <Link href="/" className="flex items-center space-x-2 focus-ring rounded-lg p-2">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          <span className="text-muted-foreground">Back to home</span>
        </Link>
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <EnhancedGlassCard size="lg" className="space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <motion.div 
              className="w-16 h-16 mx-auto rounded-xl gradient-bg flex items-center justify-center"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <Brain className="w-8 h-8 text-white" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Mock'n-Hire</h1>
              <p className="text-muted-foreground">
                {isSignup ? 'Create your account' : 'Welcome back'}
              </p>
            </div>
          </div>

          {/* Auth Toggle */}
          <div className="flex p-1 rounded-lg bg-accent/30">
            <motion.button
              type="button"
              onClick={() => {
                setIsSignup(false)
                setErrors({})
              }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all focus-ring ${
                !isSignup 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              whileHover={{ scale: !isSignup ? 1 : 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Sign In
            </motion.button>
            <motion.button
              type="button"
              onClick={() => {
                setIsSignup(true)
                setErrors({})
              }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all focus-ring ${
                isSignup 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              whileHover={{ scale: isSignup ? 1 : 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Sign Up
            </motion.button>
          </div>

          {/* Role Selection */}
          <AnimatePresence mode="wait">
            {isSignup && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <label className="block text-sm font-medium text-foreground">
                  I am a...
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <motion.button
                    type="button"
                    onClick={() => setRole('recruiter')}
                    className={`p-4 rounded-lg border transition-all focus-ring ${
                      role === 'recruiter'
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border bg-accent/30 hover:bg-accent/50'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Users className="w-6 h-6 mx-auto mb-2 text-primary" />
                    <div className="text-sm font-medium text-foreground">Recruiter</div>
                    <div className="text-xs text-muted-foreground">Hire talent</div>
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setRole('student')}
                    className={`p-4 rounded-lg border transition-all focus-ring ${
                      role === 'student'
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border bg-accent/30 hover:bg-accent/50'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <GraduationCap className="w-6 h-6 mx-auto mb-2 text-primary" />
                    <div className="text-sm font-medium text-foreground">Student</div>
                    <div className="text-xs text-muted-foreground">Practice interviews</div>
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <AnimatePresence mode="wait">
              {isSignup && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <EnhancedGlassInput
                    label="Full Name"
                    type="text"
                    placeholder="Enter your full name"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    error={errors.name}
                    icon={<User className="w-4 h-4" />}
                    required
                  />
                </motion.div>
              )}
            </AnimatePresence>
            
            <EnhancedGlassInput
              label="Email Address"
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              error={errors.email}
              icon={<Mail className="w-4 h-4" />}
              required
            />
            
            <EnhancedGlassInput
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              error={errors.password}
              icon={<Lock className="w-4 h-4" />}
              hint={isSignup ? "Must be at least 6 characters" : undefined}
              required
            />

            <AnimatePresence mode="wait">
              {isSignup && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <EnhancedGlassInput
                    label="Confirm Password"
                    type="password"
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                    error={errors.confirmPassword}
                    icon={<Lock className="w-4 h-4" />}
                    required
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <EnhancedGlassButton
              type="submit"
              variant="primary"
              fullWidth
              loading={isLoading}
              size="lg"
            >
              {isSignup ? 'Create Account' : 'Sign In'}
            </EnhancedGlassButton>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-card text-muted-foreground">or continue with</span>
            </div>
          </div>

          {/* Google Auth */}
          <EnhancedGlassButton
            type="button"
            onClick={handleGoogleAuth}
            fullWidth
            loading={isLoading}
            icon={<Chrome className="w-5 h-5" />}
            size="lg"
          >
            Google
          </EnhancedGlassButton>

          {/* Footer */}
          <div className="text-center text-sm text-muted-foreground">
            {isSignup ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setIsSignup(false)}
                  className="text-primary hover:underline focus-ring rounded"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => setIsSignup(true)}
                  className="text-primary hover:underline focus-ring rounded"
                >
                  Sign up
                </button>
              </>
            )}
          </div>
        </EnhancedGlassCard>
      </motion.div>
    </div>
  )
}