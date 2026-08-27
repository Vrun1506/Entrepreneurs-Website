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

// ════════════════════════════════════════════════════════════════════
// Changing your email address.
//
// The real flow, not a mocked one: the test reads the actual 6-digit code
// out of the local mail catcher. That is why the change-email template is
// wired into the local config — the stock GoTrue template carries only a
// confirmation link and no {{ .Token }}, so there would be no code to read.
//
// GoTrue sends a code to BOTH mailboxes with double_confirm_changes on,
// but only the one sent to the CURRENT address is usable: verifying it
// applies the change outright, and the new-address code is rejected. The
// second test pins that down, because it is the security property the
// whole design rests on — a stolen session cannot move the account
// without the mailbox it already has.
//
// Runs as its own user because it changes that account's address, and
// restores it afterwards via the service client so a local re-run
// against a persistent stack still signs in during global-setup.
// ════════════════════════════════════════════════════════════════════

import { waitForCode, clearMailbox } from "./mailpit";

test.describe("settings email change", () => {
  test.use({ storageState: storageStatePath("emailchange") });

  const original = USERS.emailchange.email;
  const next = "e2e-emailchange-new@imperial.ac.uk";

  const service = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  test.afterAll(async () => {
    const admin = service();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const user = data?.users.find((u) => u.email === next || u.email === original);
    if (user && user.email !== original) {
      await admin.auth.admin.updateUserById(user.id, { email: original });
    }
    // Both the change and the restore above are logged. Clear them so a
    // persistent local stack does not accumulate a run's worth each time.
    if (user) await admin.from("email_change_log").delete().eq("user_id", user.id);
    await Promise.all([clearMailbox(original), clearMailbox(next)]);
  });

  // Runs before the happy path so the account is still on its original
  // address. It leaves a pending change behind, which the next test
  // harmlessly overwrites by starting its own.
  test("the code sent to the NEW address cannot complete the change", async ({ page }) => {
    await clearMailbox(original);
    await clearMailbox(next);

    await page.goto("/settings");
    await page.getByLabel("New email address", { exact: true }).fill(next);
    await page.getByLabel("Confirm new email address").fill(next);
    await page.getByRole("button", { name: "Send code" }).click();

    // Both mailboxes receive a code. Only one of them is worth anything,
    // and it is deliberately the one at the address the account already
    // has — otherwise a stolen session could move the account using a
    // code delivered to the attacker's own inbox.
    const currentCode = await waitForCode(original);
    const newCode = await waitForCode(next);
    expect(newCode).not.toBe(currentCode);

    await page.getByLabel("Code sent to your old email address").fill(newCode);
    await page.getByRole("button", { name: "Confirm change" }).click();

    await expect(page.getByText(/code is incorrect or has expired/i)).toBeVisible();

    const admin = service();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    expect(
      data?.users.find((u) => u.email === original),
      "the account must still be on its original address",
    ).toBeTruthy();
    expect(data?.users.find((u) => u.email === next)).toBeFalsy();
  });

  test("the code sent to the current address moves the account", async ({ page }) => {
    await clearMailbox(original);
    await clearMailbox(next);

    await page.goto("/settings");
    await page.getByLabel("New email address", { exact: true }).fill(next);
    await page.getByLabel("Confirm new email address").fill(next);
    await page.getByRole("button", { name: "Send code" }).click();

    const code = await waitForCode(original);
    await page.getByLabel("Code sent to your old email address").fill(code);
    await page.getByRole("button", { name: "Confirm change" }).click();

    await expect(page.getByText(`Your email address is now`)).toBeVisible({ timeout: 20_000 });

    // The assertion that matters: auth.users actually moved.
    const admin = service();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const moved = data?.users.find((u) => u.email === next);
    expect(moved, "the account should now be on the new address").toBeTruthy();
    expect(data?.users.find((u) => u.email === original)).toBeFalsy();

    // The audit trail. This is what an admin has to work with when a member
    // mistypes the address and writes in locked out: the previous address,
    // to match against the one they contact you from. Asserted here rather
    // than only in rls_smoke because the trigger has to survive a real
    // change driven through GoTrue, not a hand-written UPDATE.
    // Newest row rather than a count. afterAll restores the address through
    // the admin API, and that restore is itself a logged change — which is
    // the trigger doing its job (it records changes made outside the form,
    // including from the Supabase dashboard), but it means history
    // accumulates across runs on a persistent local stack.
    const { data: log } = await admin
      .from("email_change_log")
      .select("old_email, new_email")
      .eq("user_id", moved!.id)
      .order("changed_at", { ascending: false })
      .limit(1);
    expect(log, "the change should have left an audit row").toHaveLength(1);
    expect(log![0]!.old_email).toBe(original);
    expect(log![0]!.new_email).toBe(next);
  });

  // The compliance half of the audit trail, and the half most likely to be
  // quietly wrong. This project keeps PII sparingly on purpose, so a log of
  // former addresses is only defensible while deleting an account still
  // deletes everything about them. Exercised through the admin API — the
  // path admin_delete_user, delete_my_account and reject_user all end in —
  // rather than a raw DELETE.
  test("deleting an account takes its email history with it", async () => {
    const admin = service();
    const throwaway = "e2e-cascade@imperial.ac.uk";

    const { data: created, error } = await admin.auth.admin.createUser({
      email: throwaway,
      email_confirm: true,
      user_metadata: { first_name: "Cass", surname: "Cade", role: "student" },
    });
    if (error) throw new Error(`cascade seed failed: ${error.message}`);
    const id = created.user!.id;

    await admin.from("email_change_log").insert({
      user_id: id,
      old_email: throwaway,
      new_email: "e2e-cascade-new@imperial.ac.uk",
    });
    const { data: before } = await admin.from("email_change_log").select("id").eq("user_id", id);
    expect(before).toHaveLength(1);

    await admin.auth.admin.deleteUser(id);

    const { data: after } = await admin.from("email_change_log").select("id").eq("user_id", id);
    expect(after, "the log row should not outlive the account").toHaveLength(0);
  });

  // The domain rule is enforced by the DB trigger, but the trigger fires
  // on the final write — after both codes. Catching it here is what stops
  // a student visiting two mailboxes only to be refused at the end.
  test("a student cannot move off the Imperial domain, and nothing is sent", async ({ page }) => {
    let updateCalled = false;
    await page.route("**/auth/v1/user**", (route) => {
      updateCalled = true;
      route.abort();
    });

    await page.goto("/settings");
    await page.getByLabel("New email address", { exact: true }).fill("mia@gmail.com");
    await page.getByLabel("Confirm new email address").fill("mia@gmail.com");
    await page.getByRole("button", { name: "Send code" }).click();

    await expect(
      page.getByText("Student accounts must keep an @imperial.ac.uk or @ic.ac.uk address."),
    ).toBeVisible();
    expect(updateCalled, "no updateUser request should fire for a bad domain").toBe(false);
  });
});
