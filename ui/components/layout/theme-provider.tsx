"use client"

import { useEffect } from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { type ThemeProviderProps } from "next-themes/dist/types"

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  useEffect(() => {
    // Apply theme classes to ensure proper styling
    const applyThemeClasses = () => {
      const theme = document.documentElement.getAttribute('data-theme') || 
                   document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      
      // Ensure body has the correct theme class
      document.body.classList.remove('theme-light', 'theme-dark')
      document.body.classList.add(`theme-${theme}`)
      
      // Update meta theme-color for mobile browsers
      const metaThemeColor = document.querySelector('meta[name="theme-color"]')
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', 
          theme === 'dark' ? '#0f172a' : '#ffffff'
        )
      }
    }

    // Apply on initial load
    applyThemeClasses()

    // Listen for theme changes
    const observer = new MutationObserver(applyThemeClasses)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    })

    return () => observer.disconnect()
  }, [])

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
