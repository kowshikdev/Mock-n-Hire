"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { toast } from "sonner";

import { useAppStore } from "@/lib/store";
import { signOut } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/layout/wordmark";

/**
 * DESIGN.md `top-nav`: 64px tall, canvas background, ink text, wordmark
 * left, horizontal menu, actions right. Collapses to a hamburger below
 * 768px per the documented responsive behaviour.
 *
 * The previous navbar carried a scroll-reactive backdrop blur, a theme
 * toggle, and non-functional Bell/Search buttons. All three are gone: the
 * design system has one fixed theme and no glass surfaces, and shipping
 * controls that do nothing when clicked is worse than not shipping them.
 */
export function Navbar() {
  const { user, setUser } = useAppStore();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      setUser(null);
      setMobileOpen(false);
      toast.success("Signed out");
      router.push("/");
    } catch {
      toast.error("Could not sign out. Please try again.");
    }
  };

  const links = user
    ? [
        { label: "Dashboard", href: `/dashboard/${user.role}` },
        ...(user.role === "student"
          ? [{ label: "History", href: "/session-history" }]
          : []),
        { label: "Settings", href: "/settings" },
      ]
    : [];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-canvas/90 backdrop-blur-sm">
      <div className="container-content flex h-16 items-center justify-between gap-lg">
        <Link
          href={user ? `/dashboard/${user.role}` : "/"}
          className="shrink-0"
          aria-label="Mock'n-Hire home"
        >
          <Wordmark />
        </Link>

        {/* Desktop menu */}
        <nav className="hidden items-center gap-xl md:flex" aria-label="Main">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-nav-link transition-colors hover:text-ink",
                isActive(link.href) ? "text-ink" : "text-body"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-sm md:flex">
          {user ? (
            <>
              <span className="text-caption text-muted">{user.name || user.email}</span>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/auth/login">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/auth/login?mode=signup">Get started</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile trigger */}
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className="flex size-10 items-center justify-center rounded-pill text-ink hover:bg-surface-strong md:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-hairline bg-canvas md:hidden">
          <nav
            className="container-content flex flex-col gap-xs py-base"
            aria-label="Mobile"
          >
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-md px-sm py-sm text-nav-link transition-colors hover:bg-surface-strong",
                  isActive(link.href) ? "text-ink" : "text-body"
                )}
              >
                {link.label}
              </Link>
            ))}

            <div className="mt-xs flex flex-col gap-xs border-t border-hairline pt-base">
              {user ? (
                <Button variant="outline" onClick={handleSignOut}>
                  Sign out
                </Button>
              ) : (
                <>
                  <Button variant="outline" asChild>
                    <Link href="/auth/login" onClick={() => setMobileOpen(false)}>
                      Sign in
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link
                      href="/auth/login?mode=signup"
                      onClick={() => setMobileOpen(false)}
                    >
                      Get started
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
