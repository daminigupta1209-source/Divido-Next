import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 375, height: 812 } });

test.describe("Past Member UI behaviors", () => {
  test("Should render (Left) suffix and keep past members selectable in splits", async ({ page }) => {
    test.setTimeout(60000);

    page.on("console", (msg) => {
      console.log(`[CONSOLE] ${msg.type()}: ${msg.text()}`);
    });

    // Clear state & set testing flag
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("divido_e2e_testing", "true");
    });
    await page.reload();
    await page.waitForTimeout(3000);

    // Continue as demo user if prompted
    const demoBtn = page.getByRole("button", { name: "Continue as demo user" });
    if (await demoBtn.isVisible()) {
      await demoBtn.click();
      await page.waitForTimeout(2000);
    }

    // 1. Create a group
    // In mobile, we might need to open the sidebar or directly interact
    // Wait, let's see how groups are navigated in mobile
    await page.click("text=New Group");
    const groupNameInput = page.getByPlaceholder("Enter group name");
    await groupNameInput.fill("UI Test Group");
    await groupNameInput.press("Enter");
    await page.waitForTimeout(2000);

    // 2. Add friend "Ronnie"
    await page.locator("text=+ Friend").first().click();
    const friendNameInput = page.getByPlaceholder("e.g. Rahul S, Priya...");
    await friendNameInput.fill("Ronnie");
    await friendNameInput.press("Enter");
    await page.click("text=Add 1 Friend");
    await page.click("text=Done");
    await page.waitForTimeout(2000);

    // 3. Create an expense splitting with Ronnie
    await page.getByTitle("Add Expense").first().click();
    await page.getByPlaceholder("What was this for?").fill("Test Bill");
    await page.getByPlaceholder("0.00").fill("100");
    // Verify Ronnie is in splitters and checked
    await expect(page.locator("text=Ronnie")).toBeVisible();
    await page.locator("#save-expense-btn").click();
    await page.waitForTimeout(2000);

    // 4. Remove Ronnie from group
    await page.locator("text=Members").first().click();
    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });
    await page.getByTitle("Remove member").first().click();
    await page.waitForTimeout(2000);
    await expect(page.locator("text=Past Members")).toBeVisible();
    
    // Close the members modal using Escape
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);

    // 5. Open previous expense and check UI indicators
    await page.locator("text=Test Bill").first().click();
    await page.waitForTimeout(1000);
    
    // Check quick list contains "Ronnie (Left)" and is checked
    const checkboxLabel = page.locator("span:has-text('Ronnie (Left)')");
    await expect(checkboxLabel).toBeVisible();

    // Check "Paid By" dropdown includes "Ronnie (Left)"
    await page.locator("text=PAID BY").locator("..").locator("button, div").first().click();
    await expect(page.locator("text=Ronnie (Left)")).toBeVisible();
    // Dismiss dropdown by clicking label
    await page.locator("text=PAID BY").click();

    // Check "Split Shares" (Unequally/Percentage) screen includes "Ronnie (Left)"
    await page.locator("text=Equally").click();
    await page.locator("text=Unequally").click();
    await page.locator("text=Split Shares").first().click();
    await expect(page.locator("text=Ronnie (Left)")).toBeVisible();
  });
});
