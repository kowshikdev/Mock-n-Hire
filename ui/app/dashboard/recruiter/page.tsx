"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Plus } from "lucide-react";

import { useAppStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/section";
import { EmptyState, ErrorState, LoadingState, Stat } from "@/components/ui/states";
import { NewScreeningModal } from "./components/new-screening-modal";

type Job = {
  job_id: string;
  job_title: string;
  created_at: string;
};

type JobStatus = { job_id: string; status: string };

const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default function RecruiterDashboard() {
  const { showNewScreeningModal, setShowNewScreeningModal, user } = useAppStore();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  /*
   * Screenings and their statuses are two separate tables, so both are
   * fetched here and joined client-side by job_id.
   *
   * Neither query filters by user_id: RLS scopes `job_descriptions` to the
   * owning recruiter, and `job_status` through its parent job. Adding an
   * explicit filter would be redundant, and silently wrong if the policy
   * ever changes.
   */
  const load = useCallback(async () => {
    setState("loading");
    try {
      const { data: jobRows, error: jobErr } = await supabase
        .from("job_descriptions")
        .select("job_id,job_title,created_at")
        .order("created_at", { ascending: false });

      if (jobErr) throw jobErr;
      const list = (jobRows ?? []) as Job[];
      setJobs(list);

      if (list.length > 0) {
        const { data: statusRows, error: statusErr } = await supabase
          .from("job_status")
          .select("job_id,status")
          .in(
            "job_id",
            list.map((j) => j.job_id)
          );
        if (statusErr) throw statusErr;

        setStatuses(
          Object.fromEntries(
            ((statusRows ?? []) as JobStatus[]).map((r) => [r.job_id, r.status])
          )
        );
      } else {
        setStatuses({});
      }

      setState("ready");
    } catch (err) {
      console.error("Failed to load screenings:", err);
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Counts are derived from the rows actually on screen. The previous
   * dashboard called a fetchSummary() that returned a hardcoded
   * { completed: 0, total: 0 } with the real RPC commented out, so both
   * stat cards permanently read 0 regardless of how many screenings existed.
   */
  const total = jobs.length;
  const completed = jobs.filter(
    (j) => statuses[j.job_id]?.toLowerCase() === "complete"
  ).length;
  const running = total - completed;

  return (
    <>
      <div className="section-band">
        <Container className="flex flex-col gap-xl">
          {/* Header */}
          <div className="flex flex-col justify-between gap-base sm:flex-row sm:items-end">
            <div className="flex flex-col gap-xs">
              <span className="eyebrow">Recruiter</span>
              <h1 className="font-display text-display-md text-ink md:text-display-lg">
                {user?.name ? `Welcome back, ${user.name.split(" ")[0]}` : "Your screenings"}
              </h1>
              <p className="text-body-md text-body">
                Upload candidate resumes against a role and review a ranked shortlist.
              </p>
            </div>
            <Button onClick={() => setShowNewScreeningModal(true)}>
              <Plus />
              New screening
            </Button>
          </div>

          {/* Stats */}
          {state === "ready" && total > 0 && (
            <Card variant="panel" className="grid gap-lg sm:grid-cols-3">
              <Stat value={total} label="Screenings" hint="Roles you've posted" />
              <Stat value={completed} label="Completed" hint="Ranking finished" />
              <Stat value={running} label="In progress" hint="Still processing" />
            </Card>
          )}

          {/* List */}
          {state === "loading" && <LoadingState message="Loading your screenings…" />}

          {state === "error" && (
            <ErrorState
              title="Couldn't load your screenings"
              description="There was a problem reaching the database. Check your connection and try again."
              action={
                <Button variant="outline" onClick={() => void load()}>
                  Try again
                </Button>
              }
            />
          )}

          {state === "ready" && total === 0 && (
            <EmptyState
              icon={<FileText />}
              title="No screenings yet"
              description="Post a role, upload a zip of resumes, and Mock'n-Hire will rank the candidates against the job description."
              action={
                <Button onClick={() => setShowNewScreeningModal(true)}>
                  <Plus />
                  Create your first screening
                </Button>
              }
            />
          )}

          {state === "ready" && total > 0 && (
            <ul className="flex flex-col gap-sm">
              {jobs.map((job) => {
                const status = statuses[job.job_id]?.toLowerCase();
                const isComplete = status === "complete";
                return (
                  <li key={job.job_id}>
                    <Card
                      variant="feature"
                      interactive
                      className="flex flex-wrap items-center justify-between gap-base"
                    >
                      <div className="flex min-w-0 flex-col gap-xxs">
                        <CardTitle className="truncate">{job.job_title}</CardTitle>
                        <span className="text-caption text-muted">
                          Created {dateFmt.format(new Date(job.created_at))}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-base">
                        <Badge variant={isComplete ? "success" : "pending"}>
                          {isComplete ? "Complete" : status ? "Processing" : "Pending"}
                        </Badge>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/dashboard/recruiter/results/${job.job_id}`}>
                            View results
                            <ArrowRight />
                          </Link>
                        </Button>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </Container>
      </div>

      {showNewScreeningModal && (
        <NewScreeningModal
          open={showNewScreeningModal}
          onClose={() => setShowNewScreeningModal(false)}
        />
      )}
    </>
  );
}
