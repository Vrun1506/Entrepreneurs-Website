"use client";

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

const TYPE_STYLES: Record<string, { border: string; text: string; bg: string }> = {
  Networking:     { border: "border-gold/30",       text: "text-gold",      bg: "bg-gold/8" },
  Demo:           { border: "border-[#6aa0ff]/25",   text: "text-[#6aa0ff]", bg: "bg-[#6aa0ff]/8" },
  Hackathon:      { border: "border-[#a064ff]/25",   text: "text-[#a064ff]", bg: "bg-[#a064ff]/8" },
  "Office Hours": { border: "border-[#64d282]/25",   text: "text-[#64d282]", bg: "bg-[#64d282]/8" },
};

/* ── Sub-components ───────────────────────────────────────────────── */
function SectionLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div className="w-8 h-px bg-gold shrink-0" />
      <span className="text-gold text-[0.75rem] font-medium tracking-[0.1em] uppercase">{text}</span>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const s = TYPE_STYLES[type] ?? TYPE_STYLES["Networking"];
  return (
    <span className={`text-[0.7rem] px-2.5 py-0.5 rounded-full border ${s.border} ${s.text} ${s.bg}`}>
      {type}
    </span>
  );
}

function ReserveButton() {
  return (
    <button className="text-[0.75rem] px-3.5 py-1 rounded-full cursor-pointer border border-gold/30 text-gold bg-gold/8 transition-colors duration-150 hover:bg-gold/15">
      Reserve
    </button>
  );
}

function EventCard({ day, month, title, type, location, desc, spots }: typeof EVENTS[number]) {
  return (
    <div className="flex flex-col p-6 rounded-xl bg-bg-card border border-border-subtle transition-all duration-200 hover:border-border hover:-translate-y-0.5">
      <div className="flex justify-between items-center mb-5">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-[1.75rem] text-text-primary leading-none">{day}</span>
          <span className="text-[0.8rem] text-text-muted">{month}</span>
        </div>
        <TypeBadge type={type} />
      </div>

      <h3 className="text-[0.95rem] font-medium text-text-primary leading-snug mb-1">{title}</h3>
      <p className="text-[0.75rem] text-text-muted mb-3">{location}</p>
      <p className="text-[0.8rem] text-text-secondary font-light leading-relaxed flex-1 mb-5">{desc}</p>

      <div className="flex justify-between items-center pt-3 border-t border-border-subtle">
        <span className="text-[0.725rem] text-text-muted">{spots}</span>
        <ReserveButton />
      </div>
    </div>
  );
}

/* ── Section ──────────────────────────────────────────────────────── */
export default function Events() {
  return (
    <section
      id="events"
      className="py-28 px-8 bg-bg-secondary border-y border-border-subtle"
    >
      <div className="max-w-[1200px] mx-auto">
        <SectionLabel text="Events" />

        <div className="flex flex-wrap justify-between items-end gap-6 mb-12">
          <h2 className="font-display leading-[1.15] tracking-tight text-[clamp(1.8rem,3vw,2.6rem)]">
            Things worth
            <br />
            <em className="text-gold">showing up for.</em>
          </h2>

          <p className="text-[0.875rem] text-text-secondary font-light leading-[1.65] max-w-[360px]">
            No death-by-panel. Every Foundry event is designed around one thing:
            useful interactions that wouldn&apos;t happen otherwise.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {EVENTS.map((event) => <EventCard key={event.title} {...event} />)}
        </div>
      </div>
    </section>
  );
}