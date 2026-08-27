import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { USERS } from "./fixtures";

// ════════════════════════════════════════════════════════════════════
// The query string is the source of truth for every list filter.
//
// Two claims are worth a real browser rather than a unit test:
//
//  1. In "client" mode the filters travel through window.history.pushState,
//     which Next patches so useSearchParams observes it. That is a promise
//     about a framework internal — if it ever stops holding, every filter
//     on /events, /vcs, /opportunities and /admin/community silently stops
//     responding to a click. Nothing but a browser can tell us.
//
//  2. Client mode must not cost a server round trip. That was the whole
//     reason not to reach for router.push here, and it is invisible from
//     the source.
// ════════════════════════════════════════════════════════════════════

/**
 * Retries an interaction until the URL reflects it.
 *
 * Not paranoia: the list markup is server-rendered, so the controls exist
 * and accept input before React has attached to them. Under a loaded CI box
 * that window is wide enough to swallow a keystroke, and the assertion then
 * fails on a page that is working perfectly. Every action passed here is
 * idempotent, so replaying it is safe — but only until it lands, which is
 * why the guard below checks the URL before acting rather than after.
 */
async function untilUrl(
  page: import("@playwright/test").Page,
  act: () => Promise<void>,
  pattern: RegExp,
) {
  await expect(async () => {
    // Only replay while the action hasn't landed. Some controls remove
    // themselves once they've done their job — FilterBar renders "Clear all"
    // only while a filter is active — so a blind replay waits on a button
    // that no longer exists, and the URL assertion below is never reached.
    // The retry then fails on a page that did exactly what it was asked.
    if (!pattern.test(page.url())) await act();
    await expect(page).toHaveURL(pattern, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** Survives a client-side URL change; wiped by any document navigation. */
async function markDocument(page: import("@playwright/test").Page) {
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__docId = "kept"; });
}
async function documentSurvived(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as unknown as Record<string, unknown>).__docId === "kept");
}

test.describe("filters live in the URL", () => {
  test("a chip click writes the URL and the chip reflects it — without reloading", async ({ page }) => {
    await page.goto("/events");
    await markDocument(page);

    await page.getByRole("button", { name: "Filters" }).click();
    const online = page.getByRole("button", { name: "Online", exact: true });
    await expect(online).toHaveAttribute("aria-pressed", "false");

    // The URL carries it…
    await untilUrl(page, () => online.click(), /[?&]mode=online/);
    // …the component re-rendered from the URL, which only happens if
    // useSearchParams saw the pushState…
    await expect(online).toHaveAttribute("aria-pressed", "true");
    // …and no document navigation happened.
    expect(await documentSurvived(page)).toBe(true);
  });

  test("the back button steps through filter history", async ({ page }) => {
    await page.goto("/vcs");
    await page.getByRole("button", { name: "Filters" }).click();

    await untilUrl(page, () => page.getByRole("button", { name: "VCs", exact: true }).click(), /[?&]kind=vc/);
    await untilUrl(page, () => page.getByRole("button", { name: "Grants", exact: true }).click(), /[?&]kind=grant/);

    await page.goBack();
    await expect(page).toHaveURL(/[?&]kind=vc/);
    await expect(page.getByRole("button", { name: "VCs", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("a filtered URL is shareable: it applies on arrival and opens the panel", async ({ page }) => {
    // Arriving cold, as if the link came from someone else.
    await page.goto("/vcs?kind=grant&from=2030-01-01");

    // The panel is open, because a view produced by filters should say so
    // rather than look like an unexplained subset.
    const panelToggle = page.getByRole("button", { name: "Filters" });
    await expect(panelToggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: "Grants", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Deadline from date")).toHaveValue("2030-01-01");
    // Two filters set -> the badge counts two.
    await expect(panelToggle).toContainText("2");
  });

  test("Clear all resets the fields it clears, including blur-committed ones", async ({ page }) => {
    // /community commits its year fields on blur, because each one costs a
    // database query. That is the case an uncontrolled defaultValue got
    // wrong: it kept displaying the cleared value.
    await page.goto("/community?gradMin=2020&role=alum");
    await expect(page.getByLabel("Graduation year from")).toHaveValue("2020");
    await expect(page.getByRole("button", { name: "Alumni" })).toHaveAttribute("aria-pressed", "true");

    await untilUrl(page, () => page.getByRole("button", { name: "Clear all" }).click(), /^[^?]*$/);

    await expect(page.getByLabel("Graduation year from")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Alumni" })).toHaveAttribute("aria-pressed", "false");
  });

  test("the search box round-trips through the URL", async ({ page }) => {
    await page.goto("/opportunities");
    const box = page.getByLabel("Search opportunities");

    // Debounced: one history entry per pause, not one per keystroke.
    await untilUrl(page, () => box.fill("quantum"), /[?&]q=quantum/);

    await page.reload();
    await expect(page.getByLabel("Search opportunities")).toHaveValue("quantum");
  });
});

test.describe("deep-linked opportunity", () => {
  // The directory's "Looking for" chips link to /opportunities?o=<id>. The
  // fragment this replaced never reached the server, so the card could only
  // pop open after hydration — and doing that needed a setState-in-effect
  // the lint rule had to be silenced for.
  let opportunityId = "";

  test.beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Emails live on auth.users, not profiles — same lookup global-setup uses.
    const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const idFor = (email: string) =>
      userList.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    const poster = idFor(USERS.student.email);
    const approver = idFor(USERS.admin.email);
    if (!poster || !approver) throw new Error("seeded users not found");

    const { data, error } = await admin
      .from("opportunities")
      .insert({
        posted_by: poster,
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: approver,
        position_name: "Deep Link Engineer",
        company: "Anchor Co",
        pay: "£1",
        location_type: "remote",
        description: "Seeded so the deep-link assertion has something to link to.",
        start_month: 1,
        start_year: 2030,
        application_deadline: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
        apply_method: "email",
        contact_email: USERS.student.email,
      })
      .select("id")
      .single();
    if (error) throw new Error(`seed failed: ${error.message}`);
    opportunityId = data!.id as string;
  });

  test.afterAll(async () => {
    if (!opportunityId) return;
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    await admin.from("opportunities").delete().eq("id", opportunityId);
  });

  test("?o=<id> renders the card already expanded, in the server's HTML", async ({ page }) => {
    const response = await page.goto(`/opportunities?o=${opportunityId}`);
    const html = (await response!.text());

    // Expanded before any JavaScript runs — that is the whole point of
    // moving this off the fragment.
    expect(html).toContain("Hide details");

    const card = page.locator(`#o-${opportunityId}`);
    // Same guard as the sibling test below, and for the same reason plus one
    // more: Suspense content is streamed into a hidden holder and then swapped
    // into place, so for one frame the same <article> exists twice. toHaveCount
    // retries, so it waits that window out — going straight to toContainText
    // hits a strict-mode violation instead, which says nothing useful.
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("button", { expanded: true })).toBeVisible();
    await expect(card).toContainText("Seeded so the deep-link assertion");
  });

  test("a card nobody deep-linked stays collapsed", async ({ page }) => {
    await page.goto("/opportunities");
    // An id must be unique. Asserting the count first turns a duplicate into
    // "expected 1, received 2" rather than a strict-mode violation on the
    // assertion below, which says nothing about what actually went wrong.
    const card = page.locator(`#o-${opportunityId}`);
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("button", { expanded: false })).toBeVisible();
    await expect(card).not.toContainText("Seeded so the deep-link assertion");
  });
});
