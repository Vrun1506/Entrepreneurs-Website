import Link from "next/link";
import GraduatesClient from "./GraduatesClient";

// Default cutoff = last calendar year. The admin can override.
function defaultCutoff(): number {
  return new Date().getFullYear() - 1;
}

export default function AdminGraduatesPage() {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-bg-primary text-text-primary px-8 py-12">
      <div className="max-w-[820px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Admin · graduate cleanup</div>
            <h1 className="font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.1] tracking-tight">
              Promote out the graduating cohort
            </h1>
            <p className="text-[0.85rem] text-text-muted mt-2 leading-relaxed">
              Removes student accounts whose graduation year is at or before the cutoff. Each affected user is emailed a congratulations note + a link to reapply as an alum if they want to keep their spot.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-[0.8rem] text-text-secondary no-underline transition-colors duration-150 hover:text-text-primary"
          >
            ← Admin home
          </Link>
        </div>

        <GraduatesClient defaultCutoff={defaultCutoff()} />
      </div>
    </main>
  );
}
