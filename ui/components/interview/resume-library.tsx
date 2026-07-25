"use client"

import { useCallback, useEffect, useState } from "react"
import { useDropzone } from "react-dropzone"
import { Check, FileText, Trash2, UploadCloud } from "lucide-react"
import { toast } from "sonner"

import { APIStudent } from "@/lib/apiStudent"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/states"

const MAX_RESUME_BYTES = 10 * 1024 * 1024 // 10 MB

export type Resume = {
  id: string
  file_name: string | null
  label: string | null
  is_default: boolean
  created_at: string
}

/**
 * The candidate's stored resumes.
 *
 * Every session used to require uploading a file, even when it was the same
 * CV as last time -- which is how one test account ended up with four copies
 * of the same document in a day. Resumes are kept now, so a repeat session is
 * a role and a duration.
 *
 * The cap is enforced server-side and surfaces here as a refusal with the
 * current list attached, rather than as a silent eviction: which resume to
 * lose is the candidate's decision, so they are asked to make it.
 */
export function ResumeLibrary({
  userId,
  selectedId,
  onSelect,
  disabled,
}: {
  userId: string | undefined
  selectedId: string | null
  onSelect: (id: string | null) => void
  disabled?: boolean
}) {
  const [resumes, setResumes] = useState<Resume[]>([])
  const [maxResumes, setMaxResumes] = useState(3)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    try {
      const res = await APIStudent("/interview/resumes", { method: "GET" })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      const list: Resume[] = data.resumes ?? []
      setResumes(list)
      setMaxResumes(data.max_resumes ?? 3)
      // Default the selection to whichever resume is marked default, so the
      // common case needs no interaction at all.
      onSelect(list.find((r) => r.is_default)?.id ?? list[0]?.id ?? null)
    } catch (err) {
      console.error("Failed to load resumes:", err)
      toast.error("Couldn't load your resumes.")
    } finally {
      setLoading(false)
    }
    // onSelect is a setState updater from the parent and stable in practice;
    // including it would re-run this on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const upload = useCallback(
    async (file: File) => {
      if (!userId) return
      setUploading(true)
      try {
        const body = new FormData()
        body.append("file", file)
        const res = await APIStudent(`/interview/upload-resume/${userId}`, { method: "POST", body })

        if (res.status === 409) {
          const { detail } = await res.json()
          toast.error(detail?.message ?? `You can keep up to ${maxResumes} resumes.`)
          return
        }
        if (!res.ok) throw new Error(await res.text())

        const created = await res.json()
        await load()
        onSelect(created.resume_id)
        toast.success(`${file.name} added.`)
      } catch (err) {
        console.error("Resume upload failed:", err)
        toast.error("Couldn't upload that resume.")
      } finally {
        setUploading(false)
      }
    },
    [userId, maxResumes, load, onSelect],
  )

  const onDrop = useCallback(
    (accepted: File[], rejected: unknown[]) => {
      if (rejected.length > 0) {
        toast.error("Please upload a PDF or DOCX.")
        return
      }
      const file = accepted[0]
      if (!file) return
      if (file.size > MAX_RESUME_BYTES) {
        toast.error("That file is over 10 MB.")
        return
      }
      void upload(file)
    },
    [upload],
  )

  const atCapacity = resumes.length >= maxResumes

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // Matches what resume_text.py can actually read.
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxFiles: 1,
    disabled: disabled || uploading || atCapacity,
  })

  const makeDefault = async (id: string) => {
    setBusyId(id)
    try {
      const res = await APIStudent(`/interview/resumes/${id}/default`, { method: "PATCH" })
      if (!res.ok) throw new Error(await res.text())
      setResumes((await res.json()).resumes ?? [])
    } catch (err) {
      console.error("Failed to set default resume:", err)
      toast.error("Couldn't update your default resume.")
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string) => {
    setBusyId(id)
    try {
      const res = await APIStudent(`/interview/resumes/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(await res.text())
      const list: Resume[] = (await res.json()).resumes ?? []
      setResumes(list)
      if (selectedId === id) {
        onSelect(list.find((r) => r.is_default)?.id ?? list[0]?.id ?? null)
      }
    } catch (err) {
      console.error("Failed to delete resume:", err)
      toast.error("Couldn't delete that resume.")
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-sm text-caption text-muted">
        <Spinner className="h-4 w-4 border-hairline-strong border-t-ink" />
        Loading your resumes…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-sm">
      {resumes.length > 0 && (
        <ul className="flex flex-col gap-xs" role="radiogroup" aria-label="Choose a resume">
          {resumes.map((r) => {
            const selected = r.id === selectedId
            return (
              <li key={r.id}>
                <div
                  className={cn(
                    "flex items-center gap-sm rounded-lg border p-sm transition-colors",
                    selected ? "border-ink bg-surface-strong" : "border-hairline-strong",
                  )}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onSelect(r.id)}
                    disabled={disabled}
                    className="flex min-w-0 flex-1 items-center gap-sm text-left disabled:opacity-50"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-ink" />
                    <span className="truncate text-body-sm text-ink">
                      {r.label || r.file_name || "Resume"}
                    </span>
                    {r.is_default && (
                      <span className="shrink-0 text-caption text-muted">Default</span>
                    )}
                  </button>

                  {busyId === r.id ? (
                    <Spinner className="h-4 w-4 border-hairline-strong border-t-ink" />
                  ) : (
                    <>
                      {!r.is_default && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => makeDefault(r.id)}
                          disabled={disabled}
                          aria-label={`Make ${r.file_name ?? "this resume"} the default`}
                        >
                          <Check />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(r.id)}
                        disabled={disabled}
                        aria-label={`Delete ${r.file_name ?? "this resume"}`}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-xxs rounded-lg border border-dashed p-base text-center transition-colors",
          isDragActive ? "border-ink bg-surface-strong" : "border-hairline-strong hover:border-ink",
          (disabled || uploading || atCapacity) && "pointer-events-none opacity-60",
        )}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <Spinner className="h-5 w-5 border-hairline-strong border-t-ink" />
        ) : (
          <UploadCloud className="h-5 w-5 text-muted" />
        )}
        <span className="text-body-sm text-ink">
          {uploading
            ? "Uploading…"
            : atCapacity
              ? `You're keeping ${maxResumes} resumes — delete one to add another`
              : resumes.length === 0
                ? "Drop your resume"
                : "Add another resume"}
        </span>
        {!atCapacity && <span className="text-caption text-muted">PDF or DOCX, up to 10 MB</span>}
      </div>
    </div>
  )
}
