import { test, expect, type Page } from "@playwright/test";
import { storageStatePath } from "./fixtures";

// The full opportunity lifecycle through the real UI, against the ephemeral
// Supabase: student submits -> it's pending in their submissions -> they edit
// it -> an admin approves it -> it goes live on the public board -> the
// student deletes it. Exercises the submission server action + RPC, the
// owner/admin RLS split, the approve RPC, and the public-listing RPC.
//
// Runs under the `member` (approved-student) project; admin steps use a
// separate browser context loaded with the admin storageState.

// The form's Field wrapper doesn't associate <label> with its input, so
// scope by the label text and grab the control inside that field group.
async function fillField(page: Page, label: string, value: string) {
  const control = page.locator(`div:has(> label:has-text("${label}"))`).locator("input, textarea").first();
  await control.fill(value);
}

const futureDate = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

async function submitOpportunity(page: Page, title: string) {
  await page.goto("/opportunities/new");
  await fillField(page, "Role title", title);
  await fillField(page, "Company", "E2E Test Co");
  await fillField(page, "Salary / compensation", "£80k");
  await fillField(page, "City / region", "London"); // default location type is hybrid
  await fillField(page, "Job description", "Automated end-to-end coverage listing.");
  await page.locator('input[type="date"]').fill(futureDate());
  // Apply method defaults to "Contact me directly" (email) — no URL needed.
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(/\/opportunities(\?|$)/);
}

test("opportunity lifecycle: submit → edit → approve → live → delete", async ({ page, browser }) => {
  const title = `E2E Founding Engineer ${Date.now()}`;
  const editedTitle = `${title} (edited)`;

  // 1. Student submits.
  await submitOpportunity(page, title);

  // 2. It shows as pending in their submissions.
  await page.goto("/my-submissions");
  await expect(page.getByText(title)).toBeVisible();

  // 3. Student edits it (allowed only while pending) and renames it.
  await page.getByRole("link", { name: "Edit" }).first().click();
  await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]+\/edit/);
  await fillField(page, "Role title", editedTitle);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/my-submissions/);
  await expect(page.getByText(editedTitle)).toBeVisible();

  // 4. An admin approves it from the review queue.
  const adminCtx = await browser.newContext({ storageState: storageStatePath("admin") });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto("/admin/opportunities");
  const card = adminPage.locator("article").filter({ hasText: editedTitle });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Approve" }).click();
  // Once approved it drops out of the pending queue.
  await expect(adminPage.locator("article").filter({ hasText: editedTitle })).toHaveCount(0);
  await adminCtx.close();

  // 5. It's now live on the public board for the student.
  await page.goto("/opportunities");
  await expect(page.getByText(editedTitle)).toBeVisible();

  // 6. Student deletes it; it disappears from their submissions.
  await page.goto("/my-submissions");
  // Scope to the row by "contains the title AND some button" rather than
  // "…AND a Delete button". Clicking Delete swaps that button out for
  // Confirm/Cancel, so a Delete-keyed locator stops matching its own row the
  // moment it is used — it only ever resolved because an ancestor happened to
  // contain a *different* row's Delete button. With the student's only
  // submission on screen there is no such ancestor, so this timed out on a
  // clean database and passed on a dirty one. CI's `retries: 1` hid it: the
  // failed attempt leaves an orphaned approved listing behind, which supplies
  // the second Delete button that makes the retry pass.
  const liveRow = page
    .locator("div")
    .filter({ hasText: editedTitle })
    .filter({ has: page.getByRole("button") })
    .last();
  await liveRow.getByRole("button", { name: "Delete" }).click();
  await liveRow.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(editedTitle)).toHaveCount(0);
});
