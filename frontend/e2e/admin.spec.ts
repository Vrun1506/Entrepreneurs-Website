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

// ════════════════════════════════════════════════════════════════════
// Bulk approve and reject.
//
// This path had no coverage of any kind — no unit test, no E2E — and it
// is the one an admin uses on a whole backlog at once. Added before the
// one-pass refactor touched it, not after: a refactor of an untested
// path is not verified by a green suite, because the suite has nothing
// to say about it.
//
// The assertions go to the database rather than stopping at the toast.
// "2 profiles updated." is rendered from a count the action returns, so
// a version that approved one member and miscounted would still print
// it. What has to be true is that every selected member changed status
// AND that every one of them was queued an email — the second is the
// half a batching refactor is most likely to drop, and the half nobody
// notices until a member asks why they were never told.
// ════════════════════════════════════════════════════════════════════

test.describe("bulk review acts on every selected member", () => {
  const BULK_PREFIX = "e2e-bulk";
  const ids: string[] = [];
  const emailOf = (i: number) => `${BULK_PREFIX}-${i}@imperial.ac.uk`;

  test.beforeAll(async () => {
    test.setTimeout(60_000);
    const admin = service();

    for (let i = 0; i < 4; i++) {
      const { data, error } = await admin.auth.admin.createUser({
        email: emailOf(i),
        email_confirm: true,
        user_metadata: { first_name: "Bulk", surname: `Member${i}`, role: "student" },
      });
      if (error) throw new Error(`bulk seed failed: ${error.message}`);
      ids.push(data.user!.id);

      // Backdated so these sort to the front of the queue, which is
      // oldest-first. Without this they land on the last page and the
      // test depends on how much else happens to be pending.
      const { error: upErr } = await admin
        .from("profiles")
        .update({
          first_name: "Bulk",
          surname: `Member${i}`,
          course: "MEng Bulk",
          grad_year: 2030,
          status: "pending_review",
          created_at: `2020-01-0${i + 1}T00:00:00Z`,
        })
        .eq("id", data.user!.id);
      if (upErr) throw new Error(`bulk seed profile failed: ${upErr.message}`);
    }
  });

  test.afterAll(async () => {
    const admin = service();
    await admin.from("outbound_email").delete().in("to_address", [0, 1, 2, 3].map(emailOf));
    await admin.from("admin_actions").delete().in("target_id", ids);
    // The rejected two are already gone — reject_user is a full delete —
    // so this tolerates a miss rather than failing the run on it.
    await Promise.all(ids.map((id) => admin.auth.admin.deleteUser(id).catch(() => {})));
  });

  /** The checkbox belongs to the row whose card carries this member's name. */
  const rowFor = (page: import("@playwright/test").Page, surname: string) =>
    page.locator("div.flex.items-start.gap-3").filter({ hasText: surname });

  test("approving a selection updates every one and queues every email", async ({ page }) => {
    await page.goto("/admin/users");

    await rowFor(page, "Member0").getByRole("checkbox").check();
    await rowFor(page, "Member1").getByRole("checkbox").check();

    await page.getByRole("button", { name: "Approve 2" }).click();
    // Generous: the pre-refactor path is six sequential round trips per
    // member, and this assertion is about correctness, not speed.
    await expect(page.getByText("2 profiles updated.")).toBeVisible({ timeout: 30_000 });

    const admin = service();
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, status")
      .in("id", [ids[0], ids[1]]);
    expect(profiles?.map((p) => p.status).sort()).toEqual(["approved", "approved"]);

    const { data: mail } = await admin
      .from("outbound_email")
      .select("to_address, subject")
      .in("to_address", [emailOf(0), emailOf(1)]);
    expect(mail).toHaveLength(2);
    for (const m of mail ?? []) expect(m.subject).toContain("welcome to Foundry");
  });

  // reject_user is a FULL DELETE, not a status flip: it cascades
  // auth.users and keeps only an admin_actions row, whose `notes` is the
  // reason. That is the only place the reason survives — profiles has no
  // rejected_reason column, and the profile row itself is gone.
  test("rejecting a selection deletes them and records the reason", async ({ page }) => {
    const reason = "Not an Imperial affiliate";
    await page.goto("/admin/users");

    await rowFor(page, "Member2").getByRole("checkbox").check();
    await rowFor(page, "Member3").getByRole("checkbox").check();

    await page.getByRole("button", { name: "Reject\u2026" }).click();
    await page.getByLabel("Rejection reason").fill(reason);
    await page.getByRole("button", { name: "Reject 2" }).click();
    await expect(page.getByText("2 profiles updated.")).toBeVisible({ timeout: 30_000 });

    const admin = service();
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id")
      .in("id", [ids[2], ids[3]]);
    expect(error).toBeNull();
    expect(profiles).toEqual([]);

    const { data: audit } = await admin
      .from("admin_actions")
      .select("target_id, notes")
      .eq("action", "reject_user")
      .in("target_id", [ids[2], ids[3]]);
    expect(audit).toHaveLength(2);
    for (const a of audit ?? []) expect(a.notes).toBe(reason);

    const { data: mail } = await admin
      .from("outbound_email")
      .select("to_address, subject")
      .in("to_address", [emailOf(2), emailOf(3)]);
    expect(mail).toHaveLength(2);
    for (const m of mail ?? []) expect(m.subject).toContain("Your Foundry application");
  });
});
