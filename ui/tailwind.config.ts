import type { Config } from 'tailwindcss';

/**
 * Design tokens are a direct transcription of DESIGN.md.
 *
 * Two deliberate rules encoded here:
 *   1. No `darkMode`. The design system is a single off-white editorial
 *      canvas -- there is no dark variant to switch to.
 *   2. Colors are flat hex, not `hsl(var(--x))` indirection. The previous
 *      config routed every color through a CSS variable so a theme could be
 *      swapped at runtime; with one fixed theme that layer is dead weight
 *      and made the real values impossible to read at a glance.
 */
const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand / action -- the ink pill is the ONLY CTA color.
        ink: {
          DEFAULT: '#0c0a09',
          primary: '#292524',
          active: '#0c0a09',
        },
        // Text
        //
        // No `strong` sub-key here on purpose: `fontSize` below also defines
        // a `body-strong` token (weight/size preset), which every real call
        // site uses paired with an explicit color class (`text-body-strong
        // text-ink`) -- never on its own. A `colors.body.strong` entry would
        // generate its own `text-body-strong` color utility under the exact
        // same class name, which `tailwind-merge` cannot tell apart from the
        // font-size one without a custom classGroup for both, and which
        // silently discarded whichever one it decided lost the conflict
        // (see lib/utils.ts). Two theme scales sharing one literal class
        // name was the root cause, not just the merge config -- removing
        // the never-actually-used color half is the real fix.
        body: '#4e4e4e',
        muted: {
          DEFAULT: '#777169',
          soft: '#a8a29e',
        },
        // Surfaces
        canvas: {
          DEFAULT: '#f5f5f5',
          soft: '#fafafa',
          deep: '#0c0a09',
        },
        surface: {
          card: '#ffffff',
          strong: '#f0efed',
          dark: '#0c0a09',
          'dark-elevated': '#1c1917',
        },
        // Hairlines
        hairline: {
          DEFAULT: '#e7e5e4',
          soft: '#f0efed',
          strong: '#d6d3d1',
        },
        // Inverted text
        'on-primary': '#ffffff',
        'on-dark': {
          DEFAULT: '#ffffff',
          soft: '#a8a29e',
        },
        // Atmospheric gradient stops. DECORATION ONLY -- never a button
        // fill, never a text color (see DESIGN.md "Don't").
        orb: {
          mint: '#a7e5d3',
          peach: '#f4c5a8',
          lavender: '#c8b8e0',
          sky: '#a8c8e8',
          rose: '#e8b8c4',
        },
        // Semantic
        success: '#16a34a',
        error: '#dc2626',
      },

      fontFamily: {
        // Waldenburg is licensed; DESIGN.md names EB Garamond / GT Sectra as
        // substitutes. Cormorant Garamond is used instead because it is the
        // only free Garamond that ships weight 300 -- and DESIGN.md calls
        // weight 300 "the editorial signature" three separate times. EB
        // Garamond's lightest weight on Google Fonts is 400, which would
        // lose exactly the characteristic the system is built around.
        display: ['var(--font-display)', 'Georgia', 'Times New Roman', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },

      fontSize: {
        'display-mega': ['64px', { lineHeight: '1.05', letterSpacing: '-1.92px', fontWeight: '300' }],
        'display-xl': ['48px', { lineHeight: '1.08', letterSpacing: '-0.96px', fontWeight: '300' }],
        'display-lg': ['36px', { lineHeight: '1.17', letterSpacing: '-0.36px', fontWeight: '300' }],
        'display-md': ['32px', { lineHeight: '1.13', letterSpacing: '-0.32px', fontWeight: '300' }],
        'display-sm': ['24px', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '300' }],
        'title-md': ['20px', { lineHeight: '1.35', letterSpacing: '0', fontWeight: '500' }],
        'title-sm': ['18px', { lineHeight: '1.44', letterSpacing: '0.18px', fontWeight: '500' }],
        'body-md': ['16px', { lineHeight: '1.5', letterSpacing: '0.16px', fontWeight: '400' }],
        'body-strong': ['16px', { lineHeight: '1.5', letterSpacing: '0.16px', fontWeight: '500' }],
        'body-sm': ['15px', { lineHeight: '1.47', letterSpacing: '0.15px', fontWeight: '400' }],
        caption: ['14px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '400' }],
        'caption-upper': ['12px', { lineHeight: '1.4', letterSpacing: '0.96px', fontWeight: '600' }],
        button: ['15px', { lineHeight: '1', letterSpacing: '0', fontWeight: '500' }],
        'nav-link': ['15px', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '500' }],
      },

      spacing: {
        xxs: '4px',
        xs: '8px',
        sm: '12px',
        base: '16px',
        md: '20px',
        lg: '24px',
        xl: '32px',
        xxl: '48px',
        section: '96px',
      },

      borderRadius: {
        none: '0px',
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        xxl: '24px',
        pill: '9999px',
      },

      maxWidth: {
        content: '1200px',
      },

      boxShadow: {
        // Single shadow tier, per DESIGN.md "Elevation & Depth".
        soft: '0 4px 16px rgba(0, 0, 0, 0.04)',
        lift: '0 8px 24px rgba(0, 0, 0, 0.06)',
      },

      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        // Slow atmospheric drift for the gradient orbs.
        drift: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(3%, -4%) scale(1.05)' },
          '66%': { transform: 'translate(-3%, 3%) scale(0.97)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },

      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        drift: 'drift 24s ease-in-out infinite',
        'fade-up': 'fade-up 0.5s ease-out both',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
