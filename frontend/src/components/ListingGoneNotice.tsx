// Rendered inside an expanded listing card when useListingFreshness
// reports the row is gone. The viewer gets a friendly message and a
// button to remove the now-irrelevant card from their local list.

export function ListingGoneNotice({
  kind, onDismiss,
}: {
  kind: "opportunity" | "event" | "VC/grant";
  onDismiss: () => void;
}) {
  return (
    <div className="px-6 py-8 border-t border-border-subtle text-center">
      <div className="text-[1.05rem] text-text-primary mb-1">
        Sorry — this {kind} is no longer available.
      </div>
      <p className="text-[0.85rem] text-text-muted mb-5 leading-relaxed">
        The poster may have removed it, or an admin pulled it from the directory. Refresh the page to see the latest set.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="px-4 py-2 rounded-lg bg-white/[0.05] border border-border-strong text-text-primary text-[0.8rem] cursor-pointer transition-colors hover:bg-white/[0.10]"
      >
        Remove from list
      </button>
    </div>
  );
}
