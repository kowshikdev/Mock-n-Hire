"use client";
import { useEffect } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes/dist/types";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  useEffect(() => {
    // Ensure <html> has the correct theme class for SSR/CSR consistency
    const html = document.documentElement;
    const theme = html.classList.contains("dark") ? "dark" : "light";
    html.setAttribute("data-theme", theme);
    html.classList.remove("theme-light", "theme-dark");
    html.classList.add(`theme-${theme}`);
    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#0f172a' : '#ffffff');
    }
  }, []);

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
  );
}
