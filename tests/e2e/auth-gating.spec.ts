import { test, expect } from "@playwright/test";

test.describe("Unauthenticated Authentication Gating", () => {
  test("should force unauthenticated users to Login screen and block dashboard access", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("divido_e2e_testing", "true");
      localStorage.setItem("divido_force_logged_out", "true");
    });
    await page.reload();

    // Verify Google login button is visible
    const googleBtn = page.getByRole("button", { name: "Continue with Google" });
    await expect(googleBtn).toBeVisible();

    // Verify Guest login button is NOT visible
    const guestBtn = page.getByRole("button", { name: "Continue as Guest" });
    await expect(guestBtn).not.toBeVisible();

    // Verify sidebar/dashboard elements are NOT visible
    const newGroupBtn = page.getByTitle("New group");
    await expect(newGroupBtn).not.toBeVisible();
  });
});
