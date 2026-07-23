import { test, expect } from "@playwright/test";

test.describe("Guest User Authentication Gating", () => {
  test("should block guest user from adding expenses and redirect to Profile", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("divido_currency_setup_seen_Demo", "1");
      localStorage.setItem("divido_currency_setup_seen_You", "1");
    });
    await page.reload();

    // Click demo user login if visible
    const demoBtn = page.getByRole("button", { name: "Continue as demo user" });
    if (await demoBtn.isVisible()) {
      await demoBtn.click();
    }

    // Target the sidebar home button which is visible on desktop
    const homeTab = page.locator("aside").getByText("Home").first();
    await expect(homeTab).toBeVisible();

    // Dialog alert handler
    let dialogShown = false;
    let dialogMessage = "";
    page.on("dialog", async (dialog) => {
      dialogShown = true;
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    // Click FAB orange button (Add Options)
    const fabButton = page.getByTitle("Add Options");
    await fabButton.click();

    // In home view, click "Scan Bill" to trigger the modal and secure warning
    const scanBillBtn = page.locator("text=Scan Bill").first();
    await scanBillBtn.click();

    // Assert alert pops up
    await page.waitForTimeout(500);
    expect(dialogShown).toBe(true);
    expect(dialogMessage).toContain("Secure Google Sign-In is required");

    // Verify redirected to Profile tab
    await expect(page.locator("text=Account Security")).toBeVisible();

    // Verify highlight-glow card exists
    const securityCard = page.locator(".highlight-glow").first();
    await expect(securityCard).toBeVisible();
  });
});
