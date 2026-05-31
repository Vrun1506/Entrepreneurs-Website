"use client";

import { useState, useTransition } from "react";
import { previewGraduates, deleteGraduates } from "./actions";

type Preview = {
  count: number;
  sample: { id: string; firstName: string; surname: string; gradYear: number }[];
};

export default function GraduatesClient({ defaultCutoff }: { defaultCutoff: number }) {
  const [cutoff, setCutoff] = useState<string>(defaultCutoff.toString());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [emailsQueued, setEmailsQueued] = useState<number>(0);

  const cutoffNum = parseInt(cutoff, 10);
  const cutoffValid = Number.isFinite(cutoffNum) && cutoffNum >= 1950 && cutoffNum <= 2099;

  const handlePreview = () => {
    setError("");
    setSuccessCount(null);
    setEmailsQueued(0);
    if (!cutoffValid) { setError("Cutoff year must be between 1950 and 2099."); return; }
    startTransition(async () => {
      const res = await previewGraduates(cutoffNum);
      if (!res.ok) { setError(res.error); return; }
      setPreview(res);
    });
  };

  const handleConfirm = () => {
    setError("");
    startTransition(async () => {
      const res = await deleteGraduates(cutoffNum);
      if (!res.ok) { setError(res.error); setConfirmOpen(false); return; }
      setSuccessCount(res.deleted);
      setEmailsQueued(res.emailsQueued);
      setPreview(null);
      setConfirmOpen(false);
    });
  };

  return (
    <>
      <div className="rounded-2xl bg-bg-card border border-border-subtle p-6 space-y-5">
        <div>
          <label htmlFor="cutoff" className="block text-[0.75rem] text-text-muted mb-1.5">
            Cutoff graduation year
          </label>
          <input
            id="cutoff"
            type="number"
            value={cutoff}
            onChange={(e) => setCutoff(e.target.value)}
            min={1950}
            max={2099}
            className="w-[200px] px-4 py-3 bg-white/[0.03] border border-border rounded-lg text-[0.85rem] text-text-primary placeholder:text-text-muted outline-none transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]"
          />
          <p className="text-[0.725rem] text-text-muted mt-1.5 leading-relaxed">
            Everyone whose graduation year is at or before this value will be removed. Default is last calendar year; raise it after results day to include this year&apos;s cohort.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handlePreview}
            disabled={pending || !cutoffValid}
            className="px-5 py-3 rounded-xl bg-gold text-bg-primary text-[0.85rem] font-medium cursor-pointer transition-all duration-200 hover:bg-gold-light disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending && !confirmOpen ? "Loading…" : "Preview affected accounts"}
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-[#ff4d4d]/8 border border-[#ff4d4d]/20 text-[0.8rem] text-[#ff6b6b] leading-relaxed">
            {error}
          </div>
        )}

        {successCount !== null && (
          <div className="px-4 py-3 rounded-lg bg-gold-muted border border-gold/30 text-[0.825rem] text-gold-light leading-relaxed space-y-1">
            <div>Removed {successCount} graduate{successCount === 1 ? "" : "s"}.</div>
            {emailsQueued > 0 && (
              <div className="text-[0.775rem] text-text-muted">
                {emailsQueued} congratulations email{emailsQueued === 1 ? "" : "s"} queued for delivery. They&apos;ll send over the next few minutes via the outbound queue — check the queue stats on the admin home if anything looks stuck.
              </div>
            )}
          </div>
        )}
      </div>

      {preview && (
        <div className="mt-6 rounded-2xl bg-bg-card border border-border-subtle p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display text-[1.1rem] text-text-primary">
              {preview.count} account{preview.count === 1 ? "" : "s"} will be removed
            </h2>
            {preview.count > 0 && (
              <span className="text-[0.7rem] text-text-muted">
                Showing first {Math.min(preview.sample.length, preview.count)}
              </span>
            )}
          </div>

          {preview.count === 0 ? (
            <p className="text-[0.85rem] text-text-muted">Nothing to do at this cutoff. Either no students have graduated by {cutoffNum}, or they&apos;ve already been cleaned up.</p>
          ) : (
            <>
              <ul className="space-y-2 mb-5">
                {preview.sample.map((m) => (
                  <li key={m.id} className="text-[0.85rem] text-text-secondary">
                    {m.firstName} {m.surname} <span className="text-text-muted">· grad {m.gradYear}</span>
                  </li>
                ))}
                {preview.count > preview.sample.length && (
                  <li className="text-[0.8rem] text-text-muted italic">
                    + {preview.count - preview.sample.length} more
                  </li>
                )}
              </ul>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={pending}
                className="px-5 py-3 rounded-xl bg-[#ff4d4d]/15 border border-[#ff4d4d]/30 text-[#ff6b6b] text-[0.85rem] font-medium cursor-pointer transition-colors hover:bg-[#ff4d4d]/25 disabled:opacity-50"
              >
                Continue to delete + email →
              </button>
            </>
          )}
        </div>
      )}

      {confirmOpen && preview && (
        <ConfirmModal
          count={preview.count}
          cutoff={cutoffNum}
          pending={pending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}

function ConfirmModal({
  count, cutoff, pending, onCancel, onConfirm,
}: {
  count: number; cutoff: number; pending: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-[480px] rounded-2xl bg-bg-card border border-[#ff4d4d]/30 p-6">
        <div className="text-[0.7rem] text-[#ff6b6b] tracking-[0.18em] uppercase mb-2">Confirm permanent deletion</div>
        <h2 className="font-display text-[1.25rem] text-text-primary mb-3">
          About to delete {count} graduate{count === 1 ? "" : "s"}
        </h2>
        <p className="text-[0.825rem] text-text-secondary leading-relaxed mb-4">
          This removes every student account whose graduation year is at or before <strong>{cutoff}</strong>. Each affected user is queued a congratulations email with a link to reapply as an alum — the queue dispatches over the next few minutes.
        </p>
        <p className="text-[0.8rem] text-[#ff6b6b] leading-relaxed mb-5">
          Their profiles, posted opportunities, events, VC/grant submissions, and admin actions will be permanently removed. This cannot be undone.
        </p>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-transparent border border-border text-text-secondary text-[0.85rem] cursor-pointer transition-colors hover:text-text-primary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-[#ff4d4d]/15 border border-[#ff4d4d]/30 text-[#ff6b6b] text-[0.85rem] font-medium cursor-pointer transition-colors hover:bg-[#ff4d4d]/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "Deleting…" : "Continue — delete all"}
          </button>
        </div>
      </div>
    </div>
  );
}
