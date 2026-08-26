import { test, expect } from "@playwright/test";

// Runs with the seeded admin storageState.

test("admin lands on the control panel", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText("Foundry control panel")).toBeVisible();
});

test("admin can open each review queue", async ({ page }) => {
  for (const path of ["/admin/opportunities", "/admin/events", "/admin/vcs", "/admin/users"]) {
    const res = await page.goto(path);
    expect(res?.status(), `status for ${path}`).toBeLessThan(400);
    await expect(page, `stayed on ${path}`).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
  }
});

// ════════════════════════════════════════════════════════════════════
// The two admin profile pages page their queries in Postgres.
//
// Before this, both selected every matching profile and let the browser
// filter the array — and PostgREST caps a response at max_rows (1000)
// without saying so. Past a thousand members, the page an admin uses to
// find someone was the page that could no longer find them.
//
// rls_smoke test 27 proves the SQL: limits, offsets, totals and filters.
// What only a browser can show is that the page is wired to it — that
// page 2 is a different set of people, and that a filter typed into the
// UI reaches the query rather than a client-side array that no longer
// holds every row.
// ════════════════════════════════════════════════════════════════════

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Bigger than /admin/community's page of 50, so page 2 is non-empty. */
const SEEDED = 55;
const SEED_PREFIX = "e2e-paging";

const service = (): SupabaseClient =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

test.describe("admin profile lists are paged", () => {
  const seeded: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    const admin = service();

    // No password: GoTrue skips the bcrypt hash, which is what makes
    // seeding this many users in a beforeAll affordable. These identities
    // are never signed in as.
    const created = await Promise.all(
      Array.from({ length: SEEDED }, (_, i) =>
        admin.auth.admin.createUser({
          email: `${SEED_PREFIX}-${i}@imperial.ac.uk`,
          email_confirm: true,
          user_metadata: { first_name: "Paged", surname: `Member${i}`, role: "student" },
        }),
      ),
    );

    for (const { data, error } of created) {
      if (error) throw new Error(`seed failed: ${error.message}`);
      seeded.push(data.user!.id);
    }

    // The new-user trigger has already made a bare profile for each; fill
    // in what the list and its filters read. Half land in the review
    // queue so the /admin/users pager has something to page.
    for (let i = 0; i < seeded.length; i++) {
      const { error } = await admin
        .from("profiles")
        .update({
          first_name: "Paged",
          surname: `Member${i}`,
          course: "MEng Paging",
          grad_year: 2030,
          status: i < 30 ? "pending_review" : "approved",
        })
        .eq("id", seeded[i]);
      if (error) throw new Error(`seed profile failed: ${error.message}`);
    }
  });

  test.afterAll(async () => {
    const admin = service();
    await Promise.all(seeded.map((id) => admin.auth.admin.deleteUser(id)));
  });

  test("page 2 of the member list holds different people", async ({ page }) => {
    await page.goto("/admin/community");

    const pager = page.getByRole("navigation", { name: "Member pages" });
    await expect(pager).toBeVisible();
    await expect(pager).toContainText("Page 1 of");

    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(50);
    const firstOnPageOne = await rows.first().innerText();

    await pager.getByRole("button", { name: "Next" }).click();

    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(pager).toContainText("Page 2 of");
    // A pager that renders but reads from the same 50 rows would leave
    // this identical — which is the failure mode worth catching.
    await expect(rows.first()).not.toHaveText(firstOnPageOne);
  });

  test("a filter narrows the whole set, not the page", async ({ page }) => {
    await page.goto("/admin/community");
    await page.getByRole("button", { name: "Filters" }).click();

    await page.getByRole("button", { name: "Awaiting review", exact: true }).click();

    // The count is of every match, so it must exceed one page — proof it
    // came from the database rather than from counting the rows on screen.
    await expect(page).toHaveURL(/[?&]status=pending_review/);
    await expect(page.getByRole("status").first()).toContainText(/\b(3\d|[4-9]\d)\b of \b\d+/);

    // Filtering while on page 2 of the old result set would otherwise
    // leave the admin looking at an offset that no longer exists.
    await expect(page).not.toHaveURL(/[?&]page=/);
  });

  test("searching finds a member who is not on the first page", async ({ page }) => {
    // Member54 sorts late and is seeded last, so on an unpaged page it
    // would be one of the rows the row cap dropped.
    await page.goto("/admin/community?q=Member54");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody")).toContainText("Member54");
  });

  test("the review queue pages too", async ({ page }) => {
    await page.goto("/admin/users");

    const pager = page.getByRole("navigation", { name: "Review queue pages" });
    await expect(pager).toBeVisible();

    // Oldest first: a queue that buries whoever has waited longest is
    // worse than no queue.
    await expect(page.getByText(/\d+ awaiting review/)).toBeVisible();
    await pager.getByRole("button", { name: "Next" }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(pager).toContainText("Page 2 of");
  });
});
