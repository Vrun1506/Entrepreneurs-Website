// Deterministic date formatting shared across the app.
//
// Why not toLocaleDateString({ month: "short" })? Node's full ICU renders
// the en-GB September abbreviation as "Sept" while browsers render "Sep".
// In a client component that gets server-rendered then hydrated, that
// difference is a hydration mismatch. These helpers use fixed month/weekday
// tables so the server and client always produce identical strings.
//
// Timezone behaviour matches the previous toLocale* calls (runtime-local).

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS   = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n: number) => String(n).padStart(2, "0");

const toDate = (input: string | Date) => (typeof input === "string" ? new Date(input) : input);

/** "15 Sep 2026" */
export function formatDate(input: string | Date): string {
  const d = toDate(input);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Mon, 24 Sep 2026" */
export function formatDateWeekday(input: string | Date): string {
  const d = toDate(input);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Mon, 24 Sep 2026, 18:30" */
export function formatDateTime(input: string | Date): string {
  const d = toDate(input);
  return `${formatDateWeekday(d)}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
