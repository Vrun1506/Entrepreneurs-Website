// ════════════════════════════════════════════════════════════════════
// Foundry · The large-photo treatment for a member's face, shared by the
// directory grid, the newest-members strip, and the profile dialog.
//
// Supersedes MemberAvatar's small-inline-circle pattern for these three
// surfaces — the avatar is already a 512×512 square blob (see
// AvatarCropper's OUTPUT constant), so showing it bigger needs no new
// cropping, just a bigger box. `aspect` lets a caller ask for a square
// (cards) or a wide banner (the dialog hero, where a literal square
// would be enormous next to the panel's own width).
// ════════════════════════════════════════════════════════════════════

export function MemberPhoto({
  member,
  aspect = "aspect-square",
  rounded = "",
  fit = "cover",
}: {
  member: { firstName: string; surname: string; avatarUrl: string | null };
  /** Tailwind aspect-ratio class — "aspect-square" for cards, a wider
   *  ratio for a dialog hero. */
  aspect?: string;
  /** Tailwind rounding classes for the corners that touch the panel edge. */
  rounded?: string;
  /** "cover" fills the box and is exactly right when aspect is square —
   *  no cropping happens because the box IS the image's own shape.
   *  "contain" is for a non-square aspect (the dialog hero): the source
   *  avatar is a square crop and nobody's crop is composed the same way
   *  (headroom, tight-cropped, off-centre, a logo, whatever), so there is
   *  no position bias that's correct for every avatar — "contain" is the
   *  only option that never cuts anything off, for any avatar, full stop.
   *  It letterboxes left/right on bg-bg-secondary instead. */
  fit?: "cover" | "contain";
}) {
  const initials = `${member.firstName[0] ?? ""}${member.surname[0] ?? ""}`.toUpperCase();

  if (member.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed blob URL, not a static asset
      <img
        src={member.avatarUrl}
        alt=""
        className={`w-full ${fit === "contain" ? "object-contain" : "object-cover"} bg-bg-secondary ${aspect} ${rounded}`}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`flex w-full items-center justify-center bg-bg-secondary font-display text-text-secondary ${aspect} ${rounded}`}
    >
      <span className="text-[2rem]">{initials}</span>
    </div>
  );
}
