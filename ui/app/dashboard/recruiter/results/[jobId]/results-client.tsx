"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Award, Briefcase, Code, FileText } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/section";
import { EmptyState, ErrorState, LoadingState, Meter } from "@/components/ui/states";

/**
 * Recruiter results.
 *
 * Fixes carried in this rewrite:
 *
 *  - A `SUPABASE_BUCKET_BASE` constant hardcoded the URL of a *previous*
 *    Supabase project (pzqodlqmyfylolspvgxl), so every "view resume" link
 *    pointed at a project this app no longer uses. Resume links now use the
 *    `file_path` the backend already stores on `resume_uploads`, which is a
 *    complete public URL -- no base to hardcode or drift.
 *
 *  - The heading was derived from the *first candidate's surname*
 *    ("Patel Screening"). It now reads the real `job_title` from
 *    `job_descriptions`.
 *
 *  - The Certifications bar rendered `certifications_courses ? 78 : 0` -- an
 *    invented 78% shown as if it were a computed score. Certifications are
 *    not part of the ranking formula at all (issue #9), so the bar is gone
 *    and the extracted certifications are listed as plain evidence instead.
 *
 *  - Experience/Projects scores are 0-10 from the LLM, but were fed to a
 *    0-100 progress bar, so a strong 8/10 rendered as a nearly-empty 8%.
 *    `Meter` now receives an explicit max.
 *
 *  - A failed status write left the optimistic UI change in place, showing
 *    a shortlist decision that was never saved. It now reverts and tells
 *    the user.
 */

const SCORE_MAX = 10;

type Row = {
  resume_id: string;
  total_score: number;
  rank: number;
  status: string;
  candidate_name: string;
  file_name: string;
  file_path: string | null;
  key_skills?: unknown;
  relevant_projects?: unknown;
  certifications_courses?: unknown;
  projects_relevance_score?: number | null;
  experience_relevance_score?: number | null;
  overall_analysis?: string | null;
};

const STATUSES = ["shortlisted", "waitlisted", "declined"] as const;

/** The LLM returns these as either a JSON array or a comma-joined string. */
function toList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export default function ResultsPageClient({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [jobTitle, setJobTitle] = useState<string>("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [{ data: job }, { data: rankings, error: rankErr }] = await Promise.all([
        supabase
          .from("job_descriptions")
          .select("job_title")
          .eq("job_id", jobId)
          .maybeSingle(),
        supabase
          .from("resume_rankings")
          .select("resume_id,total_score,rank,status")
          .eq("job_id", jobId)
          .order("total_score", { ascending: false }),
      ]);

      if (rankErr) throw rankErr;
      setJobTitle(job?.job_title ?? "");

      const ranked = rankings ?? [];
      if (ranked.length === 0) {
        setRows([]);
        setState("ready");
        return;
      }

      const ids = ranked.map((r) => r.resume_id);
      const [{ data: uploads }, { data: analyses }] = await Promise.all([
        supabase
          .from("resume_uploads")
          .select("resume_id,candidate_name,file_name,file_path")
          .in("resume_id", ids),
        supabase
          .from("resume_analysis")
          .select(
            "resume_id,key_skills,relevant_projects,certifications_courses,projects_relevance_score,experience_relevance_score,overall_analysis"
          )
          .in("resume_id", ids),
      ]);

      const uploadMap = Object.fromEntries((uploads ?? []).map((u) => [u.resume_id, u]));
      const analysisMap = Object.fromEntries((analyses ?? []).map((a) => [a.resume_id, a]));

      setRows(
        ranked.map((r) => ({
          ...r,
          candidate_name: uploadMap[r.resume_id]?.candidate_name || "Unnamed candidate",
          file_name: uploadMap[r.resume_id]?.file_name || "",
          file_path: uploadMap[r.resume_id]?.file_path ?? null,
          ...analysisMap[r.resume_id],
        })) as Row[]
      );
      setSelectedIdx(0);
      setState("ready");
    } catch (err) {
      console.error("Failed to load results:", err);
      setState("error");
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = rows[selectedIdx];

  const updateStatus = async (newStatus: string) => {
    const row = rows[selectedIdx];
    if (!row || savingStatus) return;

    const previous = row.status;
    setSavingStatus(true);
    setRows((rs) => rs.map((r, i) => (i === selectedIdx ? { ...r, status: newStatus } : r)));

    const { error } = await supabase
      .from("resume_rankings")
      .update({ status: newStatus })
      .eq("resume_id", row.resume_id)
      .eq("job_id", jobId);

    setSavingStatus(false);

    if (error) {
      // Roll the optimistic update back -- leaving it would show a
      // shortlist decision that was never actually saved.
      console.error("Failed to update status:", error);
      setRows((rs) => rs.map((r, i) => (i === selectedIdx ? { ...r, status: previous } : r)));
      toast.error("Couldn't save that decision. Please try again.");
    }
  };

  if (state === "loading") {
    return (
      <div className="section-band">
        <Container>
          <LoadingState message="Loading candidate rankings…" />
        </Container>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="section-band">
        <Container>
          <ErrorState
            title="Couldn't load these results"
            description="There was a problem reaching the database."
            action={
              <Button variant="outline" onClick={() => void load()}>
                Try again
              </Button>
            }
          />
        </Container>
      </div>
    );
  }

  return (
    <div className="section-band">
      <Container className="flex flex-col gap-xl">
        {/* Header */}
        <div className="flex flex-col gap-base">
          <Link
            href="/dashboard/recruiter"
            className="inline-flex w-fit items-center gap-xs text-caption text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            All screenings
          </Link>
          <div className="flex flex-col gap-xxs">
            <span className="eyebrow">Results</span>
            <h1 className="font-display text-display-md text-ink md:text-display-lg">
              {jobTitle || "Screening results"}
            </h1>
            <p className="text-body-md text-body">
              {rows.length === 0
                ? "No candidates ranked yet."
                : `${rows.length} candidate${rows.length === 1 ? "" : "s"} ranked against this role.`}
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title="No rankings for this screening"
            description="The job may still be processing, or the archive contained no readable resumes."
            action={
              <Button variant="outline" onClick={() => void load()}>
                Refresh
              </Button>
            }
          />
        ) : (
          <div className="grid gap-base lg:grid-cols-5">
            {/* Candidate list */}
            <ul className="flex flex-col gap-xs lg:col-span-2">
              {rows.map((c, i) => (
                <li key={c.resume_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedIdx(i)}
                    aria-current={i === selectedIdx}
                    className={cn(
                      "flex w-full items-center justify-between gap-base rounded-xl border p-base text-left transition-colors",
                      i === selectedIdx
                        ? "border-ink bg-surface-card"
                        : "border-hairline bg-surface-card hover:border-hairline-strong"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-sm">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-strong text-caption text-ink">
                        {c.rank}
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-body-strong text-ink">
                          {c.candidate_name}
                        </span>
                        <span className="truncate text-caption text-muted">
                          {c.status}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 font-display text-title-md text-ink">
                      {c.total_score?.toFixed(1)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {/* Detail */}
            {selected && (
              <div className="flex flex-col gap-base lg:col-span-3">
                <Card variant="panel" className="flex flex-col gap-base">
                  <div className="flex flex-wrap items-start justify-between gap-base">
                    <div className="flex flex-col gap-xxs">
                      <CardTitle>{selected.candidate_name}</CardTitle>
                      <span className="text-caption text-muted">
                        Rank {selected.rank} &middot; score {selected.total_score?.toFixed(2)}
                      </span>
                    </div>
                    <Badge
                      variant={
                        selected.status === "shortlisted"
                          ? "success"
                          : selected.status === "declined"
                            ? "error"
                            : "pending"
                      }
                    >
                      {selected.status}
                    </Badge>
                  </div>

                  {selected.overall_analysis && (
                    <p className="text-body-md text-body">{selected.overall_analysis}</p>
                  )}

                  <div className="flex flex-wrap gap-sm">
                    {STATUSES.map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={selected.status === s ? "primary" : "outline"}
                        disabled={savingStatus}
                        onClick={() => void updateStatus(s)}
                        className="capitalize"
                      >
                        {s}
                      </Button>
                    ))}
                    {selected.file_path && (
                      <Button size="sm" variant="ghost" asChild>
                        <a
                          href={selected.file_path}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open resume
                        </a>
                      </Button>
                    )}
                  </div>
                </Card>

                {/* Score breakdown -- only the two factors that actually
                    feed the ranking today. */}
                <Card variant="panel" className="flex flex-col gap-base">
                  <CardTitle>Score breakdown</CardTitle>
                  <Meter
                    label="Experience relevance"
                    value={selected.experience_relevance_score ?? 0}
                    max={SCORE_MAX}
                    valueLabel={`${selected.experience_relevance_score ?? 0}/${SCORE_MAX}`}
                  />
                  <Meter
                    label="Project relevance"
                    value={selected.projects_relevance_score ?? 0}
                    max={SCORE_MAX}
                    valueLabel={`${selected.projects_relevance_score ?? 0}/${SCORE_MAX}`}
                  />
                  <p className="text-caption text-muted">
                    Only these two factors feed the ranking today.
                  </p>
                </Card>

                <Evidence
                  icon={<Code className="size-4" />}
                  title="Skills"
                  items={toList(selected.key_skills)}
                />
                <Evidence
                  icon={<Briefcase className="size-4" />}
                  title="Relevant projects"
                  items={toList(selected.relevant_projects)}
                />
                <Evidence
                  icon={<Award className="size-4" />}
                  title="Certifications"
                  items={toList(selected.certifications_courses)}
                  note="Extracted from the resume. Not currently part of the score."
                />
              </div>
            )}
          </div>
        )}
      </Container>
    </div>
  );
}

function Evidence({
  icon,
  title,
  items,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  note?: string;
}) {
  if (items.length === 0) return null;
  return (
    <Card variant="panel" className="flex flex-col gap-sm">
      <div className="flex items-center gap-xs text-ink">
        {icon}
        <CardTitle className="text-title-sm">{title}</CardTitle>
      </div>
      <ul className="flex flex-wrap gap-xs">
        {items.map((item) => (
          <li key={item}>
            <Badge variant="outline" className="normal-case tracking-normal">
              {item}
            </Badge>
          </li>
        ))}
      </ul>
      {note && <p className="text-caption text-muted">{note}</p>}
    </Card>
  );
}
