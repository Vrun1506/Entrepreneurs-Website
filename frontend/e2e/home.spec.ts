import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { USERS } from "./fixtures";

// ════════════════════════════════════════════════════════════════════
// Foundry · /home + the app shell
//
// Covers the two things most likely to regress silently: that the rail
// reaches every destination it claims to, and that the sections degrade
// to an honest empty state rather than a blank page when the seeded DB
// has no listings.
// ════════════════════════════════════════════════════════════════════

// One approved row of each kind, so the card/deep-link tests below assert
// against real listings. Without them every card assertion is vacuous on a
// DB that happens to be empty — which is exactly how three 404ing card
// links survived to production.
test.describe("home", () => {
  const TITLES = {
    event: "Seeded Home Card Event",
    opp:   "Seeded Home Card Role",
    vc:    "Seeded Home Card Fund",
  };
  const seeded: { events?: string; opportunities?: string; vcs_grants?: string } = {};

  function admin() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  test.beforeAll(async () => {
    const db = admin();
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    const idFor = (email: string) =>
      list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    const student = idFor(USERS.student.email);
    const approver = idFor(USERS.admin.email);
    if (!student || !approver) throw new Error("seeded users not found");

    const approved = {
      status: "approved" as const,
      approved_at: new Date().toISOString(),
      approved_by: approver,
      posted_by: student,
    };

    const { data: ev, error: evErr } = await db.from("events").insert({
      ...approved,
      title: TITLES.event,
      description: "Seeded so the home Events card has a row.",
      luma_link: "https://lu.ma/home-card",
      event_at: new Date(Date.now() + 21 * 86_400_000).toISOString(),
      location: "Imperial",
      organiser_name: "Foundry",
      contact_email: USERS.student.email,
    }).select("id").single();
    if (evErr) throw new Error(`seed event: ${evErr.message}`);
    seeded.events = ev!.id as string;

    const { data: opp, error: oppErr } = await db.from("opportunities").insert({
      ...approved,
      position_name: TITLES.opp,
      company: "Home Card Co",
      pay: "£1",
      location_type: "remote",
      description: "Seeded so the home Opportunities card has a row.",
      start_month: 1,
      start_year: 2030,
      application_deadline: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
      apply_method: "email",
      contact_email: USERS.student.email,
    }).select("id").single();
    if (oppErr) throw new Error(`seed opportunity: ${oppErr.message}`);
    seeded.opportunities = opp!.id as string;

    const { data: vc, error: vcErr } = await db.from("vcs_grants").insert({
      ...approved,
      kind: "grant",
      name: TITLES.vc,
      description: "Seeded so the home VCs and Grants card has a row.",
      link: "https://example.com/home-card-fund",
      amount: "£10k",
    }).select("id").single();
    if (vcErr) throw new Error(`seed vc: ${vcErr.message}`);
    seeded.vcs_grants = vc!.id as string;
  });

  test.afterAll(async () => {
    const db = admin();
    for (const [table, id] of Object.entries(seeded)) {
      if (id) await db.from(table as "events").delete().eq("id", id);
    }
  });

  test("greets the member and renders every listing section", async ({ page }) => {
    await page.goto("/home");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    for (const name of ["Events", "Opportunities", "VCs and Grants"]) {
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    }

    // Either real cards or the empty state — never nothing.
    const events = page.locator("section", { hasText: "Foundry gatherings" });
    await expect(events.locator("li, p").first()).toBeVisible();
  });

  test("each section offers a way through to its full page", async ({ page }) => {
    await page.goto("/home");

    for (const [label, href] of [
      ["View all Events", "/events"],
      ["View all Opportunities", "/opportunities"],
      ["View all VCs and Grants", "/vcs"],
    ] as const) {
      await expect(page.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
  });

  test("the newest-members strip moved here, and off the directory", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: /newest members/i })).toBeVisible();

    // The member search that used to sit under the greeting is gone: the
    // directory owns searching, and one box that navigates away was a
    // second, worse entry point to it.
    await expect(page.getByRole("searchbox")).toHaveCount(0);

    await page.goto("/members");
    await expect(page.getByRole("heading", { name: /newest members/i })).toHaveCount(0);
  });

  test("messaging is reachable and says so plainly", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Messaging" }).click();

    await expect(page).toHaveURL(/\/messaging$/);
    await expect(page.getByRole("heading", { name: "Coming Soon!" })).toBeVisible();
  });

  // The cards used to point at /events/<id> and /opportunities/<id>, which
  // are not routes in this app — every one of them 404ed. Asserting the href
  // shape would have kept passing; only following it catches that.
  test("every listing card leads somewhere that exists", async ({ page }) => {
    await page.goto("/home");

    // The sections stream in under Suspense, so the cards are not in the
    // first HTML. Collecting hrefs without waiting reads an empty list on a
    // cold server and an populated one on a warm server — a flake that
    // reports itself as "no cards", which is indistinguishable from the bug
    // this test exists to catch.
    const cards = page.locator("section ul li a");
    await expect(cards.first()).toBeVisible();

    const hrefs = await cards.evaluateAll(
      (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!),
    );
    expect(hrefs.length, "beforeAll seeds one of each kind").toBeGreaterThanOrEqual(3);

    for (const href of hrefs) {
      const res = await page.goto(href);
      expect(res?.status(), `${href} should resolve`).toBe(200);
    }
  });

  test("a deep-linked card arrives open, in the server's HTML", async ({ page }) => {
    // Server-rendered open, not opened after hydration — so JS-off and
    // slow-hydration readers see the thing they followed the link for.
    for (const [list, param, prefix] of [
      ["/events", "e", "e"],
      ["/opportunities", "o", "o"],
      ["/vcs", "v", "v"],
    ] as const) {
      await page.goto(list);
      const first = page.locator("article[id]").first();
      await expect(first).toBeVisible();
      const id = (await first.getAttribute("id"))!.slice(prefix.length + 1);

      await page.goto(`${list}?${param}=${id}`);
      await expect(
        page.locator(`article#${prefix}-${id}`).getByText(/Hide details/),
      ).toBeVisible();
    }
  });

  test("the rail links to every destination it lists", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation", { name: "Main" });

    for (const [label, href] of [
      ["Home", "/home"],
      ["Members", "/members"],
      ["Messaging", "/messaging"],
      ["Opportunities", "/opportunities"],
      ["Events", "/events"],
      ["Grants & VCs", "/vcs"],
      ["Calendar", "/calendar"],
      ["My activity", "/my-activity"],
      ["My submissions", "/my-submissions"],
    ] as const) {
      await expect(nav.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }

    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("collapsing the rail persists across a reload", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation", { name: "Main" });

    await expect(nav.getByRole("link", { name: "Members" })).toBeVisible();
    await page.getByRole("button", { name: "Collapse navigation" }).click();

    // Labels go, the destinations stay reachable by their accessible name.
    await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();
  });

  test("the old /community route still lands, filters intact", async ({ page }) => {
    // Filtered directory views are links people have already shared, so the
    // redirect has to carry the query — not just the path.
    await page.goto("/community?role=alum&gradMin=2020");
    await expect(page).toHaveURL(/\/members\?.*role=alum/);
    await expect(page).toHaveURL(/gradMin=2020/);
  });

});
