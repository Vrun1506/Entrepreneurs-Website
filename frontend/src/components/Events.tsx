import { SectionHead } from "@/components/SectionHead";

/* ── Data ─────────────────────────────────────────────────────────── */
const EVENTS = [
  {
    day: "14", month: "May",
    title: "Founder Speed Networking",
    type: "Networking",
    location: "Imperial College Union, London",
    desc: "30-minute slots. Meet 6 founders in one evening. Structured, fast, no filler.",
    spots: "28 spots left",
  },
  {
    day: "21", month: "May",
    title: "Demo Night · Spring 2025",
    type: "Demo",
    location: "The Hive, White City",
    desc: "Twelve startups, five-minute pitches, open Q&A. Angels and VCs in the room.",
    spots: "Open to members",
  },
  {
    day: "3",  month: "Jun",
    title: "HealthTech Hackathon",
    type: "Hackathon",
    location: "Barclays Eagle Labs, London",
    desc: "48 hours. Teams of 2–5. £10k prize pool, mentored by Barclays clinicians.",
    spots: "60 spots left",
  },
  {
    day: "18", month: "Jun",
    title: "Angel Office Hours",
    type: "Office Hours",
    location: "Online · Zoom",
    desc: "One-on-one 20-min sessions with angels actively deploying into pre-seed rounds.",
    spots: "12 slots available",
  },
] as const;

/* ── Sub-components ───────────────────────────────────────────────── */
function EventCell({ day, month, title, type, location, desc, spots }: typeof EVENTS[number]) {
  return (
    <article className="flex flex-col bg-bg-primary p-6 transition-colors duration-150 hover:bg-bg-card">
      <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-border-subtle pb-3">
        {/* A date is a measurement. It is the one thing on this cell that gets
            the mono face, and tabular figures keep the four dates in a row
            optically aligned even at different digit counts. */}
        <div className="data flex items-baseline gap-1.5">
          <span className="text-[1.6rem] leading-none text-text-primary">{day}</span>
          <span className="text-[0.8rem] text-text-muted">{month}</span>
        </div>
        {/* Same reasoning as the opportunity kind: a field, not a coloured pill. */}
        <span className="label-wide text-text-primary">{type}</span>
      </div>

      <h3 className="mb-1 text-[1rem] font-medium leading-snug text-text-primary">{title}</h3>
      <p className="mb-3 text-[0.75rem] text-text-muted">{location}</p>
      <p className="mb-6 flex-1 text-[0.8rem] leading-relaxed text-text-secondary">{desc}</p>

      <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
        <span className="text-[0.72rem] text-text-muted">{spots}</span>
        <button
          type="button"
          className="cursor-pointer rounded-lg border border-border-strong bg-white/[0.05] px-3.5 py-1.5 text-[0.75rem] text-text-primary transition-colors duration-150 hover:border-accent hover:bg-white/[0.10]"
        >
          Reserve
        </button>
      </div>
    </article>
  );
}

/* ── Section ──────────────────────────────────────────────────────── */
export default function Events() {
  return (
    <section id="events" className="border-y border-border-subtle bg-bg-secondary px-8 py-24">
      <div className="mx-auto max-w-[1200px]">
        {/* Treatment 4 of 5: the wordmark's other half. Light weight, tracked
            open, both lines equal — the ENTREPRENEURS register at headline
            size, where the previous four sections all ran heavy. */}
        <SectionHead
          label="Events"
          aside={
            <p className="max-w-[38ch] text-[0.875rem] leading-[1.65] text-text-secondary">
              Networking, demos, hackathons and office hours — designed to put you in
              the same room as the people worth meeting.
            </p>
          }
        >
          <h2 className="text-[clamp(1.8rem,3.2vw,2.7rem)] font-light leading-[1.14] tracking-[0.01em] text-text-primary">
            <span className="block">Things worth</span>
            <span className="block">showing up for.</span>
          </h2>
        </SectionHead>

        <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {EVENTS.map((event) => <EventCell key={event.title} {...event} />)}
        </div>
      </div>
    </section>
  );
}
