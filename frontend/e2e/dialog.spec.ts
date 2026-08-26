import { test, expect } from "@playwright/test";

// Regression cover for components/ui/Dialog, which replaced two hand-rolled
// <div role="dialog" aria-modal> overlays with the native <dialog> element.
// The old markup *claimed* modality to assistive tech without providing any
// of it, so what's asserted here is precisely what changed: focus enters the
// dialog, cannot reach the page behind it, and returns to whatever opened it.
//
// Runs under the `member` project — /community is member-gated.

test("member dialog: focus enters, stays in the top layer, Escape restores focus", async ({ page }) => {
  await page.goto("/community");
  const trigger = page.locator('[role="button"][tabindex="0"]').first();
  await trigger.waitFor();
  const before = await trigger.evaluate((el) => el.outerHTML.slice(0, 200));
  await trigger.click();

  const dlg = page.locator("dialog");
  await expect(dlg).toBeVisible();
  expect(await dlg.evaluate((d: HTMLDialogElement) => d.matches(":modal"))).toBe(true);
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);

  // Chrome wraps a single-focusable dialog via the document itself, so BODY is
  // an expected stop. What must never happen is focus landing on page content
  // behind the dialog.
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const where = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || a === document.body) return "body";
      return a.closest("dialog") ? "dialog" : `LEAKED:${a.tagName}.${a.className}`;
    });
    expect(where, `Tab #${i + 1}`).toMatch(/^(dialog|body)$/);
  }

  // The page behind is inert: a programmatic focus attempt is refused.
  expect(await trigger.evaluate((el: HTMLElement) => {
    el.focus();
    return document.activeElement === el;
  })).toBe(false);

  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200) ?? "<none>")).toBe(before);
});

test("dialog close button (not Escape) also restores focus to the trigger", async ({ page }) => {
  await page.goto("/community");
  const trigger = page.locator('[role="button"][tabindex="0"]').first();
  await trigger.waitFor();
  const before = await trigger.evaluate((el) => el.outerHTML.slice(0, 200));
  await trigger.click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200) ?? "<none>")).toBe(before);
});

test("clicking the backdrop closes the dialog", async ({ page }) => {
  await page.goto("/community");
  await page.locator('[role="button"][tabindex="0"]').first().click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.locator("dialog")).toHaveCount(0);
});
