import Link from 'next/link';
import {
  ArrowRight,
  ClipboardList,
  FileText,
  Layers,
  ListChecks,
  MessageSquareQuote,
  Mic,
  ScanSearch,
  SlidersHorizontal,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Container, Section, SectionHeading } from '@/components/ui/section';
import { OrbField } from '@/components/ui/orb';

/**
 * Landing page.
 *
 * This is a Server Component -- the previous version was a 580-line client
 * component that shipped framer-motion, scroll listeners and an IntersectionObserver
 * to render what is entirely static marketing copy. None of that reaches the
 * browser now; entrance motion is a CSS animation instead.
 *
 * Content note: the previous page carried three invented customer
 * testimonials ("Sarah Chen, HR Director at TechCorp") and four invented
 * statistics ("50K+ Candidates Screened", "95% Accuracy Rate", "500+
 * Companies Trust Us"). None of it was real. Publishing fabricated
 * endorsements and usage numbers is deceptive advertising, so all of it is
 * gone rather than restyled. What replaces it describes only what the
 * product actually does today.
 */

export const metadata = {
  title: "Mock'n-Hire — AI interview practice & resume screening",
  description:
    'Practice interviews generated from your own resume, with a transcript-backed review of every answer. Screen and rank candidates against a real job description.',
};

const CANDIDATE_STEPS = [
  {
    icon: FileText,
    title: 'Upload your resume',
    body: 'Your interview is generated from what is actually on it — your projects, your stack, your experience.',
  },
  {
    icon: Mic,
    title: 'Answer out loud',
    body: 'Respond by voice, the way you would in a real interview. Every answer is transcribed automatically.',
  },
  {
    icon: ListChecks,
    title: 'Get a scored review',
    body: 'Each answer comes back with a score and written feedback, plus a summary across the whole session.',
  },
];

const RECRUITER_STEPS = [
  {
    icon: ClipboardList,
    title: 'Post the role',
    body: 'Paste the job description and set how much experience and project work should count.',
  },
  {
    icon: Layers,
    title: 'Upload candidates in bulk',
    body: 'Drop in a zip of resumes. Each one is parsed, analysed against the description, and stored.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Review a ranked shortlist',
    body: 'Candidates come back ranked, with the extracted skills and projects behind each score.',
  },
];

const CAPABILITIES = [
  {
    icon: ScanSearch,
    title: 'Resume-grounded questions',
    body: 'Questions are written against your actual resume text rather than pulled from a generic bank, so they reference your real work.',
  },
  {
    icon: MessageSquareQuote,
    title: 'Written feedback per answer',
    body: 'Every answer is scored and returned with reasoning, not just a number — so you know what to change next time.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Weighted candidate ranking',
    body: 'Recruiters decide how much experience and project relevance matter, and rankings recompute against those weights.',
  },
];

export default function HomePage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <Section className="overflow-hidden pt-xxl md:pt-section">
        <OrbField variant="hero" />
        <Container>
          <div className="mx-auto flex max-w-3xl animate-fade-up flex-col items-center gap-lg text-center">
            <span className="eyebrow">Now live</span>
            <h1 className="font-display text-display-md text-ink md:text-display-xl lg:text-display-mega">
              Interview practice that
              <br />
              knows what&rsquo;s on your resume
            </h1>
            <p className="max-w-xl text-body-md text-body">
              Mock&rsquo;n-Hire generates a spoken interview from your own resume, transcribes
              every answer, and gives you a scored review. The same engine ranks candidates
              against a real job description for recruiters.
            </p>
            <div className="flex flex-col gap-sm sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/auth/login?mode=signup">
                  Start practising
                  <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#recruiters">I&rsquo;m hiring</Link>
              </Button>
            </div>
          </div>
        </Container>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* What it does                                                      */}
      {/* ---------------------------------------------------------------- */}
      <Section tone="soft" id="how-it-works">
        <Container>
          <SectionHeading
            eyebrow="What it does"
            title="Two sides of the same interview"
            lede="Candidates rehearse against their own history. Recruiters screen against the role they actually posted."
            align="center"
          />
          <div className="mt-xxl grid gap-base md:grid-cols-3">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <Card key={title} variant="feature" interactive className="flex flex-col gap-sm">
                <span className="flex size-10 items-center justify-center rounded-pill bg-surface-strong text-ink">
                  <Icon className="size-5" />
                </span>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{body}</CardDescription>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* For candidates                                                    */}
      {/* ---------------------------------------------------------------- */}
      <Section id="candidates">
        <Container>
          <div className="grid gap-xxl lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start">
            <SectionHeading
              eyebrow="For candidates"
              title="Rehearse the interview you're actually going to have"
              lede="No generic question bank. The session is built from your resume, so the questions sound like the ones an interviewer who read it would ask."
            />
            <ol className="flex flex-col gap-base">
              {CANDIDATE_STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title}>
                  <Card variant="feature" className="flex items-start gap-base">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-strong text-ink">
                      <Icon className="size-5" />
                    </span>
                    <div className="flex flex-col gap-xxs">
                      <span className="eyebrow">Step {i + 1}</span>
                      <CardTitle>{title}</CardTitle>
                      <CardDescription>{body}</CardDescription>
                    </div>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        </Container>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* For recruiters                                                    */}
      {/* ---------------------------------------------------------------- */}
      <Section tone="soft" id="recruiters" className="overflow-hidden">
        <OrbField variant="band" />
        <Container>
          <div className="grid gap-xxl lg:grid-cols-[1fr_minmax(0,420px)] lg:items-start">
            <ol className="order-2 flex flex-col gap-base lg:order-1">
              {RECRUITER_STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title}>
                  <Card variant="feature" className="flex items-start gap-base">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-strong text-ink">
                      <Icon className="size-5" />
                    </span>
                    <div className="flex flex-col gap-xxs">
                      <span className="eyebrow">Step {i + 1}</span>
                      <CardTitle>{title}</CardTitle>
                      <CardDescription>{body}</CardDescription>
                    </div>
                  </Card>
                </li>
              ))}
            </ol>
            <SectionHeading
              eyebrow="For recruiters"
              title="A shortlist you can explain"
              lede="Every ranking shows the skills and projects that produced it, so a decision can be defended rather than just accepted."
              className="order-1 lg:order-2"
            />
          </div>
        </Container>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* CTA band                                                          */}
      {/* ---------------------------------------------------------------- */}
      <Section tone="dark" className="overflow-hidden">
        <Container>
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-lg text-center">
            <h2 className="font-display text-display-md text-on-dark md:text-display-lg">
              Your next interview starts with the last thing you built
            </h2>
            <p className="text-body-md text-on-dark-soft">
              Create an account, upload a resume, and run your first session.
            </p>
            <Button size="lg" variant="onDark" asChild>
              <Link href="/auth/login?mode=signup">
                Get started
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
