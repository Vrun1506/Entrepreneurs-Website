"use client";

import { useState, useTransition } from "react";
import { approveUser, rejectUser } from "./actions";
import SocialLinks from "@/components/SocialLinks";
import { formatDate } from "@/lib/dates";
import { Button } from "@/components/ui/Button";

type Member = {
  id: string;
  firstName: string;
  surname: string;
  role: "alum" | "student";
  course: string | null;
  gradYear: number | null;
  bio: string | null;
  workingOn: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  createdAt: string;
  skills: string[];
  sectors: string[];
};

export default function UserCard({ member }: { member: Member }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  const handleApprove = () => {
    setError("");
    startTransition(async () => {
      const res = await approveUser(member.id);
      if (!res.ok) setError(res.error);
    });
  };

  const handleReject = () => {
    setError("");
    startTransition(async () => {
      const res = await rejectUser(member.id, reason);
      if (!res.ok) {
        setError(res.error);
      } else {
        setShowReject(false);
        setReason("");
      }
    });
  };

  const submitted = formatDate(member.createdAt);

  return (
    <article className="rounded-2xl bg-bg-card border border-border-subtle p-6">
      <header className="mb-4">
        <div className="text-[1.05rem] font-medium text-text-primary">
          {member.firstName} {member.surname}
        </div>
        <div className="text-[0.75rem] text-text-muted mt-1">
          {member.role === "alum" ? `Alum · grad ${member.gradYear ?? "—"}` : `Student · class of ${member.gradYear ?? "—"}`}
          {" · submitted "}{submitted}
        </div>
        {member.course && (
          <div className="text-[0.75rem] text-text-secondary mt-1">{member.course}</div>
        )}
      </header>

      {member.bio && (
        <div className="mb-3">
          <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1">Bio</div>
          <p className="text-[0.85rem] text-text-secondary leading-relaxed">{member.bio}</p>
        </div>
      )}

      {member.workingOn && (
        <div className="mb-3">
          <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1">Working on</div>
          <p className="text-[0.85rem] text-text-secondary leading-relaxed">{member.workingOn}</p>
        </div>
      )}

      {(member.sectors.length > 0 || member.skills.length > 0 || member.linkedinUrl || member.githubUrl || member.portfolioUrl) && (
        <div className="mb-4 flex flex-col gap-3">
          {(member.sectors.length > 0 || member.skills.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {member.sectors.map((s) => (
                <span key={`sec-${s}`} className="px-2 py-0.5 rounded-full text-[0.7rem] bg-gold-muted text-gold-light border border-gold/20">{s}</span>
              ))}
              {member.skills.map((s) => (
                <span key={`skl-${s}`} className="px-2 py-0.5 rounded-full text-[0.7rem] bg-white/[0.03] text-text-secondary border border-border">{s}</span>
              ))}
            </div>
          )}
          <SocialLinks linkedinUrl={member.linkedinUrl} githubUrl={member.githubUrl} portfolioUrl={member.portfolioUrl} />
        </div>
      )}

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-[#ff4d4d]/8 border border-[#ff4d4d]/20 text-[0.75rem] text-[#ff6b6b]">
          {error}
        </div>
      )}

      {showReject ? (
        <div className="space-y-3 pt-3 border-t border-border-subtle">
          <label htmlFor={`reason-${member.id}`} className="block text-[0.75rem] text-text-muted">
            Reason for rejection (internal — not shown to the user)
          </label>
          <textarea
            id={`reason-${member.id}`}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Could not verify Imperial affiliation from LinkedIn."
            className="w-full px-3 py-2 bg-white/[0.03] border border-border rounded-lg text-[0.8rem] text-text-primary placeholder:text-text-muted focus:border-gold/50 resize-none"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleReject}
              disabled={pending || !reason.trim()}
              variant="danger"
              size="sm"
            >
              {pending ? "Rejecting…" : "Confirm rejection + send email"}
            </Button>
            <Button
              type="button"
              onClick={() => { setShowReject(false); setReason(""); setError(""); }}
              disabled={pending}
              variant="ghost"
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 pt-3 border-t border-border-subtle">
          <Button
            type="button"
            onClick={handleApprove}
            disabled={pending}
            variant="primary"
            size="sm"
          >
            {pending ? "Approving…" : "Approve"}
          </Button>
          <Button
            type="button"
            onClick={() => setShowReject(true)}
            disabled={pending}
            variant="dangerGhost"
            size="sm"
          >
            Reject
          </Button>
        </div>
      )}
    </article>
  );
}
