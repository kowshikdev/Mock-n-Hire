import './globals.css';
import type { Metadata } from 'next';
import { Inter, Cormorant_Garamond } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/components/layout/auth-provider';
import { SiteChrome } from '@/components/layout/site-chrome';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

/**
 * Display face. See tailwind.config.ts for why Cormorant Garamond stands in
 * for the licensed Waldenburg: it is the only free Garamond carrying weight
 * 300, which DESIGN.md treats as the brand's editorial signature.
 */
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Mock'n-Hire — AI interview practice & resume screening",
  description:
    'Practice interviews built from your own resume, and rank candidates against a real job description. One platform for candidates and recruiters.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable}`}>
      <body className="bg-canvas text-body font-sans antialiased">
        <AuthProvider>
          <SiteChrome>{children}</SiteChrome>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
