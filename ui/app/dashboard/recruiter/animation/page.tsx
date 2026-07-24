"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

import { API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/section";
import { Meter, Spinner } from "@/components/ui/states";
import { OrbField } from "@/components/ui/orb";

const POLL_MS = 5000;
const MAX_POLLS = 60; // 5 minutes

/**
 * Polls the screening job until the backend reports completion.
 *
 * Three bugs were fixed here:
 *
 *  1. The completion check was `status === "COMPLETE"`, but the backend
 *     writes lowercase "complete" (api_service.py::update_job_status). The
 *     comparison could never be true, so this screen polled until it hit
 *     its retry cap on every single successful job.
 *
 *  2. It then redirected to `/dashboard/recruiter/results?job=<id>` -- a
 *     query-param route that does not exist. The real page is the
 *     path-based `/dashboard/recruiter/results/[jobId]`, so even a user who
 *     got past (1) landed on a 404.
 *
 *  3. `pct` was in the effect's dependency array, so the interval was torn
 *     down and rebuilt on every progress tick, and the `setStep` callback
 *     read a stale `pct` from its closure. The interval is now created once
 *     and all state updates are functional.
 *
 * The progress bar is deliberately asymptotic: the backend reports only
 * pending/complete, so there is no real percentage to show. It eases toward
 * 90% and only reaches 100% on actual confirmed completion, rather than
 * implying a precision the API cannot provide.
 */
function AnimationInner() {
  const params = useSearchParams();
  const router = useRouter();
  const jobId = params.get("job");

  const [pct, setPct] = useState(8);
  const [state, setState] = useState<"working" | "done" | "timeout" | "missing">(
    jobId ? "working" : "missing"
  );
  const pollCount = useRef(0);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;

    // Asymptotic ease toward 90 -- never implies completion on its own.
    const progress = setInterval(() => {
      setPct((p) => (p >= 90 ? p : p + Math.max(0.5, (90 - p) * 0.06)));
    }, 400);

    const poll = setInterval(async () => {
      pollCount.current += 1;

      try {
        const res = await API(`/status?job_id=${jobId}`);
        if (res.ok) {
          const { status } = await res.json();
          // Compared case-insensitively so a change of casing on either
          // side can't silently break completion again.
          if (typeof status === "string" && status.toLowerCase() === "complete") {
            if (cancelled) return;
            clearInterval(poll);
            clearInterval(progress);
            setPct(100);
            setState("done");
            setTimeout(() => {
              router.push(`/dashboard/recruiter/results/${jobId}`);
            }, 700);
            return;
          }
        }
      } catch {
        // A dropped request is expected on a cold backend; keep polling
        // until the retry cap rather than failing the whole screen.
      }

      if (pollCount.current >= MAX_POLLS && !cancelled) {
        clearInterval(poll);
        clearInterval(progress);
        setState("timeout");
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(progress);
    };
  }, [jobId, router]);

  return (
    <div className="section-band relative overflow-hidden">
      <OrbField variant="corner" />
      <Container>
        <div className="mx-auto max-w-lg">
          <Card variant="panel" className="flex flex-col items-center gap-lg text-center">
            {state === "missing" ? (
              <>
                <h1 className="font-display text-display-sm text-ink">
                  No screening specified
                </h1>
                <p className="text-body-md text-body">
                  This page needs a screening to track. Head back to your dashboard and
                  open one from there.
                </p>
                <Button asChild>
                  <Link href="/dashboard/recruiter">Back to dashboard</Link>
                </Button>
              </>
            ) : state === "timeout" ? (
              <>
                <h1 className="font-display text-display-sm text-ink">
                  Still processing
                </h1>
                <p className="text-body-md text-body">
                  This is taking longer than usual. The job is still running in the
                  background — you can check the results page later.
                </p>
                <div className="flex flex-col gap-sm sm:flex-row">
                  <Button asChild>
                    <Link href={`/dashboard/recruiter/results/${jobId}`}>
                      Open results
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/dashboard/recruiter">Back to dashboard</Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Spinner className="h-6 w-6" />
                <div className="flex flex-col gap-xs">
                  <h1 className="font-display text-display-sm text-ink">
                    {state === "done" ? "Ranking complete" : "Screening candidates"}
                  </h1>
                  <p className="text-body-md text-body">
                    {state === "done"
                      ? "Taking you to the results…"
                      : "Resumes are being parsed, analysed against the job description, and ranked. You can safely leave this page — the job keeps running."}
                  </p>
                </div>
                <Meter value={pct} className="w-full" ariaLabel="Screening progress" />
              </>
            )}
          </Card>
        </div>
      </Container>
    </div>
  );
}

export default function Animation() {
  // useSearchParams needs a Suspense boundary for this route to prerender.
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <AnimationInner />
    </Suspense>
  );
}
