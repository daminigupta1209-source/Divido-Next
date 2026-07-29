import { test, expect } from "@playwright/test";

test.describe("Guest User Authentication Gating", () => {
  test("should block guest user from creating groups and redirect to Profile", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("divido_currency_setup_seen_Demo", "1");
      localStorage.setItem("divido_currency_setup_seen_You", "1");
      localStorage.setItem("divido_e2e_testing", "true");
      localStorage.setItem("divido_force_logged_out", "true");
    });
    await page.reload();

    // Click guest user login if visible
    const guestBtn = page.getByRole("button", { name: "Continue as Guest" });
    if (await guestBtn.isVisible()) {
      await guestBtn.click();
    }

    // Dialog alert handler
    let dialogShown = false;
    let dialogMessage = "";
    page.on("dialog", async (dialog) => {
      dialogShown = true;
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    // Click FAB button (New group)
    const newGroupBtn = page.getByTitle("New group").first();
    await expect(newGroupBtn).toBeVisible();
    await newGroupBtn.click();

    // Assert alert pops up
    await page.waitForTimeout(500);
    expect(dialogShown).toBe(true);
    expect(dialogMessage).toContain("Please sign in to create a group");

    // Verify redirected to Profile tab
    await expect(page.locator("text=Account Security")).toBeVisible();
  });
});
