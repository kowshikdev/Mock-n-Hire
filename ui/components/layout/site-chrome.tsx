'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

/**
 * Decides which surfaces get site chrome.
 *
 * A live interview is a focused, timed, camera-on task -- a nav bar
 * offering "Settings" and a footer offering "Privacy Policy" mid-question
 * are invitations to accidentally destroy a recording in progress. Those
 * routes render bare.
 */
const BARE_ROUTES = ['/interview/'];

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';

  // The summary page sits under /interview/<id>/summary but is a normal
  // reading surface, so it keeps its chrome.
  const isBare =
    BARE_ROUTES.some((route) => pathname.startsWith(route)) &&
    !pathname.endsWith('/summary');

  if (isBare) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
