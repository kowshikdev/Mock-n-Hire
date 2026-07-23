"use client"

import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { signOut } from "@/lib/auth"
import { motion, AnimatePresence } from "framer-motion"
import { Brain, LogOut, Settings, User, Menu, X } from "lucide-react" 
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { toast } from "sonner"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { useState } from "react"

export function Navbar() {
  const { user, setUser } = useAppStore()
  const router = useRouter()
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Don't show navbar on landing page or auth pages
  if (!user || pathname === '/' || pathname.startsWith('/auth/')) {
    return null
  }

  const handleLogout = async () => {
    try {
      await signOut()
      setUser(null)
      toast.success('Signed out successfully')
      router.push('/')
    } catch (error) {
      console.error('Logout error:', error)
      toast.error('Failed to sign out')
    }
  }

  const navItems = [
    {
      label: 'Dashboard',
      href: `/dashboard/${user.role}`,
      active: pathname.startsWith('/dashboard')
    },
    ...(user.role === 'student' ? [
      {
        label: 'Interview History',
        href: '/session-history',
        active: pathname === '/session-history'
      }
    ] : []),
    {
      label: 'Settings',
      href: '/settings',
      active: pathname === '/settings'
    }
  ]

  return (
    <>
      <motion.nav 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed top-0 left-0 right-0 z-50 container-padding py-4"
      >
        <div className="glass-card px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link 
              href={`/dashboard/${user.role}`} 
              className="flex items-center space-x-3 group focus-ring rounded-lg p-1"
            >
              <motion.div 
                className="flex items-center justify-center w-10 h-10 rounded-lg gradient-bg"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Brain className="w-6 h-6 text-white" />
              </motion.div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold text-foreground group-hover:gradient-text transition-all duration-300">
                  Mock'n-Hire
                </h1>
                <p className="text-xs text-muted-foreground">AI Hiring Suite</p>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                    "hover:bg-accent hover:text-accent-foreground focus-ring",
                    item.active 
                      ? "bg-primary/10 text-primary border border-primary/20" 
                      : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {/* User Info & Actions */}
            <div className="flex items-center space-x-3">
              {/* User Badge */}
              <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-accent/50 border border-border">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-3 h-3 text-primary" />
                </div>
                <div className="text-sm">
                  <span className="font-medium text-foreground">{user.name}</span>
                  <span className={cn(
                    "ml-2 px-2 py-0.5 text-xs rounded-full font-medium",
                    user.role === 'recruiter' 
                      ? "bg-blue-500/20 text-blue-600 border border-blue-500/20" 
                      : "bg-green-500/20 text-green-600 border border-green-500/20"
                  )}>
                    {user.role}
                  </span>
                </div>
              </div>

              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Settings */}
              <Link href="/settings">
                <motion.button 
                  className="glass-button p-2 focus-ring"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label="Settings"
                >
                  <Settings className="w-5 h-5 text-muted-foreground" />
                </motion.button>
              </Link>

              {/* Logout */}
              <motion.button 
                onClick={handleLogout}
                className="glass-button p-2 text-red-600 hover:bg-red-500/10 focus-ring"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="Sign out"
              >
                <LogOut className="w-5 h-5" />
              </motion.button>

              {/* Mobile Menu Toggle */}
              <motion.button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden glass-button p-2 focus-ring"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed top-20 left-4 right-4 z-40 md:hidden"
          >
            <div className="glass-card p-4 space-y-2">
              {/* User Info Mobile */}
              <div className="flex items-center space-x-3 p-3 rounded-lg bg-accent/30 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{user.name}</p>
                  <p className="text-sm text-muted-foreground capitalize">{user.role}</p>
                </div>
              </div>

              {/* Navigation Links */}
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "block px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                    "hover:bg-accent hover:text-accent-foreground focus-ring",
                    item.active 
                      ? "bg-primary/10 text-primary border border-primary/20" 
                      : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Menu Backdrop */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 md:hidden"
          />
        )}
      </AnimatePresence>
    </>
  )
}