import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { USERS, storageStatePath } from "./fixtures";

// Runs with the seeded approved-student storageState. These assert that the
// minted session is genuinely accepted by the server gates — if the cookie
// were wrong, requireApprovedUser would bounce to /login.

test("approved student reaches the community directory (not bounced to /login)", async ({ page }) => {
  await page.goto("/community");
  await expect(page).toHaveURL(/\/community/);
});

test("student can open the opportunities, events and vcs tabs", async ({ page }) => {
  for (const path of ["/opportunities", "/events", "/vcs"]) {
    await page.goto(path);
    await expect(page, `stayed on ${path}`).toHaveURL(new RegExp(path.replace("/", "\\/")));
  }
});

test("student can open settings", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings/);
});

test("non-admin student gets a 404 on /admin (existence stays hidden)", async ({ page }) => {
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Foundry control panel")).toHaveCount(0);
});

// ════════════════════════════════════════════════════════════════════
// The three member pages that had no coverage at all.
//
// Added before the data-layer refactor touched them, not after: a refactor
// of an untested page is not verified by a green suite, because the suite
// has nothing to say about it.
//
// These seed real rows rather than asserting the empty state. Asserting
// "Nothing saved yet" would have passed whether the query worked or not —
// the read path degrades to [] on error by design, so a broken query and
// an empty account render the same page. A seeded row that has to appear
// is the only version of this test that can fail for the right reason.
// ════════════════════════════════════════════════════════════════════

test.describe("member pages that read per-user data", () => {
  const OPP = "Bookmarked Systems Engineer";
  const EVENT = "Seeded Upcoming Demo Night";
  let opportunityId = "";
  let eventId = "";
  let studentId = "";

  function admin() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  test.beforeAll(async () => {
    const db = admin();
    const { data: userList } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    const idFor = (email: string) =>
      userList.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    const student = idFor(USERS.student.email);
    const approver = idFor(USERS.admin.email);
    if (!student || !approver) throw new Error("seeded users not found");
    studentId = student;

    const approved = {
      status: "approved" as const,
      approved_at: new Date().toISOString(),
      approved_by: approver,
      posted_by: student,
    };

    const { data: opp, error: oppErr } = await db
      .from("opportunities")
      .insert({
        ...approved,
        position_name: OPP,
        company: "Bookmark Co",
        pay: "£1",
        location_type: "remote",
        description: "Seeded so /my-bookmarks and /my-activity have a row to render.",
        start_month: 1,
        start_year: 2030,
        application_deadline: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
        apply_method: "email",
        contact_email: USERS.student.email,
      })
      .select("id")
      .single();
    if (oppErr) throw new Error(`seed opportunity: ${oppErr.message}`);
    opportunityId = opp!.id as string;

    const { data: ev, error: evErr } = await db
      .from("events")
      .insert({
        ...approved,
        title: EVENT,
        description: "Seeded so /calendar has something upcoming.",
        luma_link: "https://lu.ma/seeded",
        event_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        location: "Imperial",
        organiser_name: "Foundry",
        contact_email: USERS.student.email,
      })
      .select("id")
      .single();
    if (evErr) throw new Error(`seed event: ${evErr.message}`);
    eventId = ev!.id as string;

    const { error: bmErr } = await db
      .from("opportunity_bookmarks")
      .insert({ user_id: student, opportunity_id: opportunityId });
    if (bmErr) throw new Error(`seed bookmark: ${bmErr.message}`);

    const { error: actErr } = await db
      .from("user_listing_actions")
      .insert({ user_id: student, listing_kind: "opportunity", listing_id: opportunityId, action_type: "applied" });
    if (actErr) throw new Error(`seed listing action: ${actErr.message}`);
  });

  test.afterAll(async () => {
    const db = admin();
    if (opportunityId) {
      await db.from("user_listing_actions").delete().eq("listing_id", opportunityId).eq("user_id", studentId);
      await db.from("opportunity_bookmarks").delete().eq("opportunity_id", opportunityId);
      await db.from("opportunities").delete().eq("id", opportunityId);
    }
    if (eventId) await db.from("events").delete().eq("id", eventId);
  });

  test("/my-bookmarks lists the opportunity this member bookmarked", async ({ page }) => {
    const res = await page.goto("/my-bookmarks");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Saved opportunities");
    await expect(page.getByText(OPP)).toBeVisible();
  });

  test("/my-activity lists what this member marked as applied", async ({ page }) => {
    const res = await page.goto("/my-activity");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("applied to or are going to");
    await expect(page.getByText(OPP)).toBeVisible();
  });

  test("/calendar shows an upcoming event", async ({ page }) => {
    const res = await page.goto("/calendar");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Events, opportunity deadlines");
    await expect(page.getByText(EVENT).first()).toBeVisible();
  });
});

// Changing the password reauthenticates with the current one first, so an
// unlocked, logged-in session can't silently reset the credential. Runs as a
// dedicated user because the success path calls signOut({ scope: "others" }),
// which revokes the seeded session — that must not disturb the shared student.
test.describe("settings password change", () => {
  test.use({ storageState: storageStatePath("reauth") });

  test("requires the correct current password", async ({ page }) => {
    const original = USERS.reauth.password;
    const next = "E2e-Reauth-Pw-456!";

    const current = page.getByLabel("Current password", { exact: true });
    const newPw = page.getByLabel("New password", { exact: true });
    const confirm = page.getByLabel("Confirm new password", { exact: true });
    const submit = page.getByRole("button", { name: "Update password" });

    await page.goto("/settings");

    // Wrong current password → rejected, credential untouched.
    await current.fill("not-the-password");
    await newPw.fill(next);
    await confirm.fill(next);
    await submit.click();
    await expect(page.getByText("Current password is incorrect.")).toBeVisible();

    // Correct current password → succeeds.
    await current.fill(original);
    await newPw.fill(next);
    await confirm.fill(next);
    await submit.click();
    await expect(page.getByText("Password updated.")).toBeVisible();

    // Restore the fixture password (fields clear only on success) so a local
    // re-run against a persistent stack still signs in during global-setup.
    // CI uses a fresh stack each run, so this is belt-and-braces.
    await current.fill(next);
    await newPw.fill(original);
    await confirm.fill(original);
    await submit.click();
    await expect(current).toHaveValue("");
  });
});
