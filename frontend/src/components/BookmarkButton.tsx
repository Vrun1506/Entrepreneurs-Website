"use client";

// The star on an opportunity, on its card and on its own page.
//
// Stateless on purpose: both callers already hold the bookmark set and do
// the optimistic flip themselves, because on /my-bookmarks un-starring
// also removes the row.

export function BookmarkButton({
  bookmarked, onClick,
}: {
  bookmarked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={bookmarked ? "Remove bookmark" : "Bookmark this opportunity"}
      aria-pressed={bookmarked}
      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-bg-card/80 backdrop-blur-sm border cursor-pointer transition-colors ${
        bookmarked
          ? "border-accent/50 text-accent hover:text-accent-light hover:border-accent"
          : "border-border text-text-muted hover:text-accent hover:border-accent"
      }`}
    >
      <svg
        width="15" height="15" viewBox="0 0 24 24"
        fill={bookmarked ? "currentColor" : "none"}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
