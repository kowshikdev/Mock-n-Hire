/* app/dashboard/recruiter/components/new-screening-modal.tsx */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { FileArchive, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { API } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/states";

interface Props {
  open: boolean;
  onClose: () => void;
}

const MAX_ZIP_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Weight sliders.
 *
 * NOTE: only experience and projects are shown. A third "certifications"
 * slider used to sit here and was posted as `weight_certifications`, but
 * the FastAPI endpoint never declared that field, so it was silently
 * discarded by request parsing and the ranking ignored it entirely --
 * a control that visibly moved and changed nothing. Wiring it end to end
 * is tracked in issue #9; until the backend accepts it, showing it would
 * keep lying about how candidates are scored.
 */
const WEIGHTS = [
  {
    key: "exp" as const,
    label: "Experience",
    hint: "How much prior work history counts",
  },
  {
    key: "proj" as const,
    label: "Projects",
    hint: "How much relevant project work counts",
  },
];

export function NewScreeningModal({ open, onClose }: Props) {
  const router = useRouter();

  const [form, setForm] = useState({ title: "", description: "", exp: 30, proj: 25 });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Close on Escape, and lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, loading]);

  const onDrop = useCallback((accepted: File[], rejected: unknown[]) => {
    if (rejected.length > 0) {
      toast.error("Only .zip archives are supported.");
      return;
    }
    const f = accepted[0];
    if (!f) return;
    if (f.size > MAX_ZIP_BYTES) {
      toast.error("That archive is over 50 MB. Please split it up.");
      return;
    }
    setFile(f);
    setErrors((e) => ({ ...e, file: "" }));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/zip": [".zip"], "application/x-zip-compressed": [".zip"] },
    disabled: loading,
  });

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = "Give the role a title";
    if (!form.description.trim()) next.description = "Paste the job description";
    if (!file) next.file = "Attach a .zip of resumes";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!validate()) return;

    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("Your session expired. Please sign in again.");
        return;
      }

      const formData = new FormData();
      formData.append("file", file as File);
      formData.append("job_title", form.title);
      formData.append("job_description", form.description);
      formData.append("weight_experience", String(form.exp));
      formData.append("weight_projects", String(form.proj));

      const res = await API("/upload-resumes/", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`HTTP ${res.status}: ${detail}`);
      }

      const { job_id } = await res.json();
      onClose();
      router.push(`/dashboard/recruiter/animation?job=${job_id}`);
    } catch (err) {
      console.error("Upload failed:", err);
      toast.error("Upload failed. Please check the archive and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/40 p-base py-xxl backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-screening-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-xl border border-hairline bg-surface-card p-xl shadow-lift">
        <div className="mb-lg flex items-start justify-between gap-base">
          <div className="flex flex-col gap-xxs">
            <span className="eyebrow">New screening</span>
            <h2 id="new-screening-title" className="font-display text-display-sm text-ink">
              Post a role and upload candidates
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
            className="flex size-9 shrink-0 items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-strong hover:text-ink disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-base" noValidate>
          <Field label="Role title" htmlFor="title" error={errors.title}>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              invalid={!!errors.title}
              placeholder="Senior Backend Engineer"
              disabled={loading}
            />
          </Field>

          <Field
            label="Job description"
            htmlFor="description"
            error={errors.description}
            hint="Candidates are scored against this text, so include the real requirements."
          >
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              invalid={!!errors.description}
              placeholder="Responsibilities, required experience, tech stack…"
              disabled={loading}
            />
          </Field>

          {/* Weights */}
          <fieldset className="flex flex-col gap-base rounded-lg border border-hairline p-base">
            <legend className="px-xs text-body-strong text-ink">Scoring weights</legend>
            {WEIGHTS.map(({ key, label, hint }) => (
              <div key={key} className="flex flex-col gap-xs">
                <div className="flex items-baseline justify-between gap-sm">
                  <Label htmlFor={`weight-${key}`}>{label}</Label>
                  <span className="text-caption text-ink">{form[key]}</span>
                </div>
                <input
                  id={`weight-${key}`}
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={form[key]}
                  disabled={loading}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: Number(e.target.value) }))
                  }
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-pill bg-surface-strong accent-ink disabled:cursor-not-allowed"
                />
                <span className="text-caption text-muted">{hint}</span>
              </div>
            ))}
          </fieldset>

          {/* Dropzone */}
          <Field label="Candidate resumes" error={errors.file}>
            {file ? (
              <div className="flex items-center justify-between gap-base rounded-lg border border-hairline-strong bg-canvas-soft p-base">
                <div className="flex min-w-0 items-center gap-sm">
                  <FileArchive className="size-5 shrink-0 text-ink" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-body-strong text-ink">{file.name}</span>
                    <span className="text-caption text-muted">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFile(null)}
                  disabled={loading}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div
                {...getRootProps()}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-xs rounded-lg border border-dashed p-xl text-center transition-colors",
                  isDragActive
                    ? "border-ink bg-surface-strong"
                    : "border-hairline-strong hover:border-ink",
                  errors.file && "border-error",
                  loading && "pointer-events-none opacity-60"
                )}
              >
                <input {...getInputProps()} />
                <UploadCloud className="size-6 text-muted" />
                <span className="text-body-strong text-ink">
                  {isDragActive ? "Drop the archive here" : "Drop a .zip of resumes"}
                </span>
                <span className="text-caption text-muted">
                  PDF and DOCX inside a single .zip, up to 50 MB
                </span>
              </div>
            )}
          </Field>

          <div className="mt-xs flex justify-end gap-sm">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Spinner className="size-4 border-white/40 border-t-white" />}
              {loading ? "Uploading…" : "Start screening"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
