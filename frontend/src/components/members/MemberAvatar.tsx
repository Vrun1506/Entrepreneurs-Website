// ════════════════════════════════════════════════════════════════════
// Foundry · Image-or-initials, shared by every place a member's face can
// appear: the directory grid, the newest-members strip on /home, and the
// profile dialog. Initials are the fallback for a member who skipped the
// photo, and the same fallback a failed SAS mint degrades to — this
// component cannot tell the two apart, and does not need to.
// ════════════════════════════════════════════════════════════════════

const SIZES = {
  sm: "h-9 w-9 text-[0.7rem]",
  md: "h-11 w-11 text-[0.8rem]",
  lg: "h-14 w-14 text-[1rem]",
} as const;

export function MemberAvatar({
  member,
  size = "md",
}: {
  member: { firstName: string; surname: string; avatarUrl: string | null };
  size?: keyof typeof SIZES;
}) {
  const initials = `${member.firstName[0] ?? ""}${member.surname[0] ?? ""}`.toUpperCase();
  const shape = `shrink-0 rounded-full border border-border-strong ${SIZES[size]}`;

  if (member.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed blob URL, not a static asset
      <img src={member.avatarUrl} alt="" className={`${shape} object-cover`} />
    );
  }

  return (
    <div className={`${shape} flex items-center justify-center font-semibold text-text-primary`}>
      {initials}
    </div>
  );
}
