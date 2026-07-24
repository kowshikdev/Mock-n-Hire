'use client';

import { useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Github, Linkedin, Twitter } from 'lucide-react';

import { Wordmark } from '@/components/layout/wordmark';
import { Orb } from '@/components/ui/orb';

/**
 * Footer.
 *
 * The COMPOSITION comes from SECTION_DESIGN.md: a two-card split (dark
 * feature card + light nav card), a badge that floats above the right
 * card's top edge, two link columns, a bottom row, and a massive faded
 * wordmark watermark that scales to the container width.
 *
 * The SKIN is DESIGN.md throughout, because SECTION_DESIGN.md describes a
 * different brand ("Kresna" -- DM Sans + Caveat, saturated #1e4fc0 blue)
 * that directly contradicts this system's "no saturated brand action
 * color" and "Waldenburg/Inter only" rules. Specifically:
 *
 *   - DM Sans / Caveat            -> display serif + Inter
 *   - #1e4fc0 blue gradient cube  -> ink surface + atmospheric orb
 *   - background <video>          -> CSS gradient orbs
 *
 * The video is dropped rather than re-pointed: the spec's src is a
 * CloudFront asset belonging to another account, so shipping it would mean
 * hotlinking someone else's bandwidth and an asset we have no licence to.
 * Orbs are this system's documented atmospheric device anyway.
 */

const NAV_COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '/#how-it-works' },
      { label: 'For candidates', href: '/#candidates' },
      { label: 'For recruiters', href: '/#recruiters' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Sign in', href: '/auth/login' },
      { label: 'Get started', href: '/auth/login?mode=signup' },
      { label: 'GitHub', href: 'https://github.com/kowshikdev/Mock-n-Hire' },
    ],
  },
];

const SOCIALS = [
  { label: 'GitHub', href: 'https://github.com/kowshikdev/Mock-n-Hire', Icon: Github },
  { label: 'LinkedIn', href: 'https://www.linkedin.com', Icon: Linkedin },
  { label: 'X', href: 'https://x.com', Icon: Twitter },
];

export function Footer() {
  return (
    <footer className="bg-canvas pt-section">
      <div className="container-content">
        <div className="grid gap-base lg:grid-cols-[minmax(0,340px)_1fr]">
          <FeatureCard />
          <NavCard />
        </div>
      </div>
      <Watermark />
    </footer>
  );
}

/** Left card: dark surface carrying the wordmark, positioning line, socials. */
function FeatureCard() {
  return (
    <div className="relative flex min-h-[340px] flex-col justify-between overflow-hidden rounded-xxl bg-surface-dark p-xl">
      {/* Atmosphere in place of SECTION_DESIGN.md's background video. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <Orb tint="lavender" size={360} className="-bottom-24 -left-16" opacity={0.32} />
        <Orb tint="sky" size={280} className="-top-16 right-0" opacity={0.22} />
      </div>

      <div className="relative">
        <Wordmark onDark />
      </div>

      <div className="relative mt-auto pt-xl">
        <p className="text-title-sm font-normal text-on-dark">
          Interview practice built from your own resume.
          <span className="block text-on-dark-soft">
            Candidate coaching and recruiter screening in one place.
          </span>
        </p>
      </div>

      <div className="relative mt-lg flex items-center justify-between gap-sm">
        <span className="text-caption text-on-dark-soft">Follow along</span>
        <ul className="flex items-center gap-xs">
          {SOCIALS.map(({ label, href, Icon }) => (
            <li key={label}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="flex size-9 items-center justify-center rounded-md bg-surface-dark-elevated text-on-dark transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-white/15"
              >
                <Icon className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Right card: floating badge, nav columns, bottom row. */
function NavCard() {
  return (
    <div className="relative rounded-xxl bg-canvas-soft p-xl md:p-[40px]">
      {/* SECTION_DESIGN.md's "Feeling lucky?" badge, restated as the
          product's own invitation and rendered in the ink/orb language. */}
      <div className="absolute -top-9 right-8 z-10 hidden flex-col items-start gap-1.5 sm:flex">
        <div
          aria-hidden="true"
          className="flex size-[88px] rotate-[-10deg] items-center justify-center rounded-[22px] bg-surface-dark shadow-lift"
        >
          <span className="rotate-[10deg] font-display text-display-md text-on-dark">
            M
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-xl pt-xs sm:gap-[72px]">
        {NAV_COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="eyebrow mb-base">{col.title}</h2>
            <ul className="flex flex-col gap-sm">
              {col.links.map((link) => (
                <li key={link.label}>
                  <FooterLink href={link.href}>{link.label}</FooterLink>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="mt-xxl flex flex-col items-start justify-between gap-lg border-t border-hairline pt-lg sm:flex-row sm:items-end">
        <p className="text-caption text-muted">
          &copy; {new Date().getFullYear()} Mock&rsquo;n-Hire. All rights reserved.
        </p>
        <p className="text-body-sm text-body sm:text-right">
          Built for candidates who want honest feedback
          <span className="block text-ink">and recruiters who want evidence.</span>
        </p>
      </div>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const isExternal = href.startsWith('http');
  const className =
    'text-body-sm text-body transition-colors hover:text-ink';

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/**
 * Oversized wordmark watermark. The SVG viewBox is refit to the rendered
 * glyph bounding box so the visible edges sit flush with the container at
 * any width -- a plain font-size would leave uneven side bearing.
 */
function Watermark() {
  const svgRef = useRef<SVGSVGElement>(null);
  const textRef = useRef<SVGTextElement>(null);

  const fit = useCallback(() => {
    const svg = svgRef.current;
    const text = textRef.current;
    if (!svg || !text) return;
    try {
      const box = text.getBBox();
      if (box.width === 0 || box.height === 0) return;
      svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
    } catch {
      // getBBox throws if the node isn't rendered yet; the resize and
      // fonts.ready handlers below will retry.
    }
  }, []);

  useEffect(() => {
    fit();
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      void document.fonts.ready.then(fit);
    }
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  return (
    <div
      aria-hidden="true"
      className="container-content pointer-events-none relative z-0 select-none"
      style={{ lineHeight: 0, marginTop: -8 }}
    >
      <svg
        ref={svgRef}
        viewBox="62 95 876 175"
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        className="block h-auto w-full overflow-visible"
      >
        <text
          ref={textRef}
          x="500"
          y="240"
          textAnchor="middle"
          fontSize="320"
          className="font-display"
          style={{ fontWeight: 300, letterSpacing: '-0.03em', fill: 'rgba(12, 10, 9, 0.05)' }}
        >
          Mock&rsquo;n-Hire
        </text>
      </svg>
    </div>
  );
}
