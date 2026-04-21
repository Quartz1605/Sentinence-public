"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { FileUp, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";

import { backendClient } from "@/lib/backend";

type ExperienceItem = {
  company: string | null;
  role: string | null;
  duration: string | null;
  description: string | null;
};

type ParsedResume = {
  name: string | null;
  email: string | null;
  phone: string | null;
  summary: string | null;
  skills: string[] | null;
  education: string[] | null;
  experience: ExperienceItem[] | null;
};

type ATSScoreBreakdown = {
  keyword_alignment: number | null;
  formatting: number | null;
  readability: number | null;
  section_completeness: number | null;
};

type ATSAnalysis = {
  overall_score: number | null;
  score_breakdown: ATSScoreBreakdown | null;
  strengths: string[];
  wording_tips: string[];
  formatting_tips: string[];
  useful_insights: string[];
};

type UploadResumeResponse = {
  resume_id: string;
  parsed_resume: ParsedResume;
  ats_analysis?: ATSAnalysis | null;
  created_at: string;
  filename?: string;
  content_type?: string | null;
};

type DeleteResumeResponse = {
  message: string;
  deleted_count: number;
};

export default function ResumePage() {
  const [file, setFile] = useState<File | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResumeResponse | null>(null);

  const canSubmit = useMemo(() => file !== null && !loading && !deleting, [file, loading, deleting]);

  useEffect(() => {
    const loadCurrentResume = async () => {
      setInitialLoading(true);
      setError(null);

      try {
        const response = await backendClient.get<UploadResumeResponse>("/resume");
        setResult(response.data);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setResult(null);
        } else if (axios.isAxiosError(err)) {
          const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
          setError(detail ?? "Failed to fetch your current resume details.");
        } else {
          setError("Unexpected error while loading resume details.");
        }
      } finally {
        setInitialLoading(false);
      }
    };

    loadCurrentResume();
  }, []);

  const onUpload = async () => {
    if (!file) {
      setError("Select a PDF or DOCX file first.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await backendClient.post<UploadResumeResponse>("/upload-resume", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setResult(response.data);
      setFile(null);
      setSuccessMessage("Resume uploaded and parsed successfully.");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
        setError(detail ?? "Resume upload failed. Please try again.");
      } else {
        setError("Unexpected error while uploading resume.");
      }
    } finally {
      setLoading(false);
    }
  };

  const onDeleteResume = async () => {
    setDeleting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await backendClient.delete<DeleteResumeResponse>("/resume");
      setResult(null);
      setFile(null);
      setSuccessMessage(response.data.message);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
        setError(detail ?? "Failed to delete resume details.");
      } else {
        setError("Unexpected error while deleting resume details.");
      }
    } finally {
      setDeleting(false);
    }
  };

  const formatScore = (score?: number | null) => (typeof score === "number" ? `${score}/100` : "N/A");

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <header className="rounded-2xl border border-[var(--border-default)] bg-gradient-to-br from-white to-[var(--surface-secondary)] p-6 sm:p-8 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-primary)]">
          Resume Parser
        </p>
        <h1 className="mt-4 text-3xl font-bold text-[var(--text-primary)] sm:text-4xl">
          Your Resume
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--text-secondary)] sm:text-base leading-relaxed">
          If a resume is already parsed for your account, it is shown here automatically.
          Delete it to upload and parse a fresh one.
        </p>
      </header>

      {/* Loading State */}
      {initialLoading ? (
        <div className="rounded-2xl border border-[var(--border-default)] bg-white/80 p-6 text-[var(--text-secondary)]">
          <div className="inline-flex items-center gap-2 text-sm">
            <RefreshCw className="h-4 w-4 animate-spin text-[var(--accent-primary)]" />
            Loading your resume details...
          </div>
        </div>
      ) : null}

      {/* Upload Form */}
      {!initialLoading && !result ? (
        <div className="rounded-2xl border border-[var(--border-default)] bg-white/80 p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <label className="flex-1 rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)] cursor-pointer">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                PDF or DOCX
              </span>
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full cursor-pointer text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--accent-primary)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[var(--accent-primary)]/90"
              />
            </label>

            <button
              type="button"
              onClick={onUpload}
              disabled={!canSubmit}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white transition-all hover:bg-[var(--accent-primary)]/90 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {loading ? "Parsing..." : "Upload & Parse"}
            </button>
          </div>

          {file ? <p className="mt-3 text-xs text-[var(--text-tertiary)]">Selected: {file.name}</p> : null}
        </div>
      ) : null}

      {/* Messages */}
      {error ? (
        <p className="rounded-xl border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/5 px-4 py-2.5 text-sm text-[var(--accent-danger)]">
          {error}
        </p>
      ) : null}
      {successMessage ? (
        <p className="rounded-xl border border-[var(--accent-success)]/30 bg-[var(--accent-success)]/5 px-4 py-2.5 text-sm text-[var(--accent-success)]">
          {successMessage}
        </p>
      ) : null}

      {/* Parsed Result */}
      {result ? (
        <article className="space-y-4 rounded-2xl border border-[var(--border-default)] bg-white/80 p-5 sm:p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Parsed Result</h2>
              <p className="text-xs text-[var(--text-tertiary)]">Resume ID: {result.resume_id}</p>
            </div>
            <button
              type="button"
              onClick={onDeleteResume}
              disabled={deleting || loading}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/5 px-3 py-2 text-xs font-medium text-[var(--accent-danger)] transition-all hover:bg-[var(--accent-danger)]/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {deleting ? "Deleting..." : "Delete Resume"}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <InfoRow label="Name" value={result.parsed_resume.name} />
            <InfoRow label="Email" value={result.parsed_resume.email} />
            <InfoRow label="Phone" value={result.parsed_resume.phone} />
            <InfoRow label="Created" value={new Date(result.created_at).toLocaleString()} />
          </div>

          <section className="rounded-xl border border-[var(--accent-primary)]/15 bg-[var(--accent-primary)]/4 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-primary)]">
              AI Summary
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
              {result.parsed_resume.summary ?? "No summary generated"}
            </p>
          </section>

          <section className="rounded-xl border border-[var(--accent-success)]/20 bg-[var(--accent-success)]/5 p-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-success)]">
                  ATS Score
                </p>
                <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
                  {formatScore(result.ats_analysis?.overall_score)}
                </p>
              </div>
              <p className="max-w-lg text-xs leading-relaxed text-[var(--text-secondary)]">
                This score estimates how ATS-friendly your resume is and highlights where wording and formatting can
                improve.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InfoRow
                label="Keyword Alignment"
                value={formatScore(result.ats_analysis?.score_breakdown?.keyword_alignment)}
              />
              <InfoRow
                label="Formatting"
                value={formatScore(result.ats_analysis?.score_breakdown?.formatting)}
              />
              <InfoRow
                label="Readability"
                value={formatScore(result.ats_analysis?.score_breakdown?.readability)}
              />
              <InfoRow
                label="Section Completeness"
                value={formatScore(result.ats_analysis?.score_breakdown?.section_completeness)}
              />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <AdviceList
              title="Wording Tips"
              items={result.ats_analysis?.wording_tips}
              emptyMessage="No wording tips available yet."
            />
            <AdviceList
              title="Formatting Tips"
              items={result.ats_analysis?.formatting_tips}
              emptyMessage="No formatting tips available yet."
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AdviceList
              title="Resume Strengths"
              items={result.ats_analysis?.strengths}
              emptyMessage="No strengths extracted yet."
            />
            <AdviceList
              title="Other Useful Insights"
              items={result.ats_analysis?.useful_insights}
              emptyMessage="No additional insights available yet."
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TagList title="Skills" items={result.parsed_resume.skills} />
            <TagList title="Education" items={result.parsed_resume.education} />
          </div>

          <section>
            <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Experience</p>
            <div className="space-y-3">
              {result.parsed_resume.experience && result.parsed_resume.experience.length > 0 ? (
                result.parsed_resume.experience.map((item, index) => (
                  <div
                    key={`${item.company ?? "company"}-${index}`}
                    className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4"
                  >
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {item.role ?? "Unknown role"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                      {item.company ?? "Unknown company"} {item.duration ? `· ${item.duration}` : ""}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {item.description ?? "No description"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--text-tertiary)]">No experience extracted.</p>
              )}
            </div>
          </section>
        </article>
      ) : null}
    </section>
  );
}

type InfoRowProps = {
  label: string;
  value: string | null;
};

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3.5 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="mt-1 text-sm text-[var(--text-primary)]">{value ?? "N/A"}</p>
    </div>
  );
}

type TagListProps = {
  title: string;
  items: string[] | null;
};

function TagList({ title, items }: TagListProps) {
  return (
    <section className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4">
      <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      {items && items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={`${title}-${item}`}
              className="rounded-full border border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/6 px-3 py-1 text-xs font-medium text-[var(--accent-primary)]"
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">No {title.toLowerCase()} extracted.</p>
      )}
    </section>
  );
}

type AdviceListProps = {
  title: string;
  items: string[] | null | undefined;
  emptyMessage: string;
};

function AdviceList({ title, items, emptyMessage }: AdviceListProps) {
  return (
    <section className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4">
      <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      {items && items.length > 0 ? (
        <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="rounded-lg border border-[var(--border-subtle)] bg-white/60 px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">{emptyMessage}</p>
      )}
    </section>
  );
}
