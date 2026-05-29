"use client";

import { useState, useTransition } from "react";
import { approveOpportunity, rejectOpportunity } from "./actions";

type Opportunity = {
  id: string;
  positionName: string;
  company: string;
  pay: string;
  locationType: "remote" | "hybrid" | "onsite";
  locationText: string | null;
  description: string;
  startMonth: number;
  startYear: number;
  applicationDeadline: string;
  contactEmail: string;
  contactEmailVisible: boolean;
  applyMethod: "email" | "link";
  applyUrl: string | null;
  postedBy: {
    firstName: string;
    surname: string;
    linkedinUrl: string | null;
    signupEmail: string | null;
  };
  skills: string[];
  sectors: string[];
  createdAt: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function OpportunityReviewCard({ opportunity: o }: { opportunity: Opportunity }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  const submittedOn = new Date(o.createdAt).toLocaleDateString("en-GB", {
    year: "numeric", month: "short", day: "numeric",
  });
  const start = `${MONTHS[o.startMonth - 1]} ${o.startYear}`;
  const deadline = new Date(o.applicationDeadline).toLocaleDateString("en-GB", {
    year: "numeric", month: "short", day: "numeric",
  });
  const location =
    o.locationType === "remote" ? "Remote"
    : o.locationType === "hybrid" ? `Hybrid${o.locationText ? ` · ${o.locationText}` : ""}`
    : o.locationText || "Onsite";

  const handleApprove = () => {
    setError("");
    startTransition(async () => {
      const res = await approveOpportunity(o.id);
      if (!res.ok) setError(res.error);
    });
  };

  const handleReject = () => {
    setError("");
    startTransition(async () => {
      const res = await rejectOpportunity(o.id, reason);
      if (!res.ok) setError(res.error);
      else { setShowReject(false); setReason(""); }
    });
  };

  return (
    <article className="rounded-2xl bg-bg-card border border-border-subtle overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-5 text-left bg-transparent border-0 cursor-pointer transition-colors duration-150 hover:bg-white/[0.02]"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[1.05rem] font-medium text-text-primary">{o.positionName}</div>
            <div className="text-[0.8rem] text-text-muted mt-1">
              {o.company} · {location} · Starts {start} · Apply by {deadline}
            </div>
            <div className="text-[0.75rem] text-text-muted mt-1">
              Posted by <span className="text-text-secondary">{o.postedBy.firstName} {o.postedBy.surname}</span>
              {o.postedBy.signupEmail && (
                <> · <span className="text-text-secondary">{o.postedBy.signupEmail}</span></>
              )}
              {" · submitted "}{submittedOn}
            </div>
          </div>
          <div className="text-[0.75rem] text-gold-light shrink-0">{o.pay}</div>
        </div>
        <div className="text-[0.7rem] text-text-muted mt-3">
          {open ? "▾ Hide full details" : "▸ Show full details"}
        </div>
      </button>

      {open && (
        <div className="px-6 pb-6 pt-1 border-t border-border-subtle space-y-5">
          <DetailBlock label="Description">
            <p className="text-[0.85rem] text-text-secondary leading-relaxed whitespace-pre-wrap">{o.description}</p>
          </DetailBlock>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailBlock label="Compensation">
              <p className="text-[0.85rem] text-text-secondary">{o.pay}</p>
            </DetailBlock>
            <DetailBlock label="Location">
              <p className="text-[0.85rem] text-text-secondary">{location}</p>
            </DetailBlock>
            <DetailBlock label="Start date">
              <p className="text-[0.85rem] text-text-secondary">{start}</p>
            </DetailBlock>
            <DetailBlock label="Application deadline">
              <p className="text-[0.85rem] text-text-secondary">{deadline}</p>
            </DetailBlock>
          </div>

          <DetailBlock label="How to apply">
            {o.applyMethod === "link" ? (
              <a href={o.applyUrl ?? "#"} target="_blank" rel="noreferrer noopener" className="text-[0.85rem] text-gold no-underline hover:underline">
                {o.applyUrl} ↗
              </a>
            ) : (
              <p className="text-[0.85rem] text-text-secondary">Via contact email below.</p>
            )}
          </DetailBlock>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailBlock label="Poster (signup email)">
              <p className="text-[0.85rem] text-text-secondary">{o.postedBy.signupEmail ?? "—"}</p>
              {o.postedBy.linkedinUrl && (
                <a href={o.postedBy.linkedinUrl} target="_blank" rel="noreferrer noopener" className="text-[0.75rem] text-gold no-underline hover:underline">LinkedIn ↗</a>
              )}
            </DetailBlock>
            <DetailBlock label="Public contact email">
              <p className="text-[0.85rem] text-text-secondary">
                {o.contactEmail}
                <span className="text-text-muted ml-2 text-[0.75rem]">
                  ({o.contactEmailVisible ? "visible to members" : "hidden"})
                </span>
              </p>
            </DetailBlock>
          </div>

          {(o.sectors.length > 0 || o.skills.length > 0) && (
            <DetailBlock label="Tags">
              <div className="flex flex-wrap gap-1.5">
                {o.sectors.map((s) => (
                  <span key={`sec-${s}`} className="px-2 py-0.5 rounded-full text-[0.7rem] bg-gold-muted text-gold-light border border-gold/20">{s}</span>
                ))}
                {o.skills.map((s) => (
                  <span key={`skl-${s}`} className="px-2 py-0.5 rounded-full text-[0.7rem] bg-white/[0.03] text-text-secondary border border-border">{s}</span>
                ))}
              </div>
            </DetailBlock>
          )}
        </div>
      )}

      {error && (
        <div className="mx-6 mb-3 px-3 py-2 rounded-lg bg-[#ff4d4d]/8 border border-[#ff4d4d]/20 text-[0.75rem] text-[#ff6b6b]">
          {error}
        </div>
      )}

      <div className="px-6 pb-6">
        {showReject ? (
          <div className="space-y-3 pt-3 border-t border-border-subtle">
            <label htmlFor={`reason-${o.id}`} className="block text-[0.75rem] text-text-muted">
              Reason for rejection (internal — not currently emailed to the poster)
            </label>
            <textarea
              id={`reason-${o.id}`}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Pay missing / duplicate / unclear company"
              className="w-full px-3 py-2 bg-white/[0.03] border border-border rounded-lg text-[0.8rem] text-text-primary placeholder:text-text-muted outline-none focus:border-gold/50 resize-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReject}
                disabled={pending || !reason.trim()}
                className="px-4 py-2 rounded-lg bg-[#ff4d4d]/15 border border-[#ff4d4d]/30 text-[#ff6b6b] text-[0.8rem] font-medium cursor-pointer transition-colors hover:bg-[#ff4d4d]/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Rejecting…" : "Confirm rejection"}
              </button>
              <button
                type="button"
                onClick={() => { setShowReject(false); setReason(""); setError(""); }}
                disabled={pending}
                className="px-4 py-2 rounded-lg bg-transparent border border-border text-text-muted text-[0.8rem] cursor-pointer transition-colors hover:text-text-primary disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 pt-3 border-t border-border-subtle">
            <button
              type="button"
              onClick={handleApprove}
              disabled={pending}
              className="px-4 py-2 rounded-lg bg-gold text-bg-primary text-[0.8rem] font-medium cursor-pointer transition-colors hover:bg-gold-light disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "Approving…" : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => setShowReject(true)}
              disabled={pending}
              className="px-4 py-2 rounded-lg bg-transparent border border-border text-text-secondary text-[0.8rem] cursor-pointer transition-colors hover:text-[#ff6b6b] hover:border-[#ff4d4d]/30 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1">{label}</div>
      {children}
    </div>
  );
}
