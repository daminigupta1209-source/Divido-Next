import { test, expect } from "@playwright/test";

test.describe("Member Leave and Rejoin flow", () => {
  test("Removing and rejoining user should work seamlessly via Rejoin links", async ({ browser }) => {
    test.setTimeout(60000); // Set custom timeout of 60 seconds

    // Context A (Inviter)
    const contextA = await browser.newContext();
    await contextA.grantPermissions(["clipboard-read", "clipboard-write"]);
    const pageA = await contextA.newPage();
    
    pageA.on("console", (msg) => {
      console.log(`[PAGE A CONSOLE] ${msg.type()}: ${msg.text()}`);
    });
    pageA.on("response", (res) => {
      if (res.status() >= 400) {
        console.log(`[PAGE A HTTP ERROR] ${res.url()} returned status ${res.status()}`);
      }
    });

    // Clear state & set localStorage flag safely by loading root page first
    await pageA.goto("/");
    await pageA.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("divido_e2e_testing", "true");
    });
    await pageA.reload();

    // Wait for auth & initial DB load to stabilize
    await pageA.waitForTimeout(3000);

    // Auth using demo login if visible (usually auto-logs in due to the flag)
    const demoBtn = pageA.getByRole("button", { name: "Continue as demo user" });
    if (await demoBtn.isVisible()) {
      await demoBtn.click();
      await pageA.waitForTimeout(2000);
    }
    const homeTab = pageA.locator("aside").getByText("Home").first();
    await expect(homeTab).toBeVisible();

    // Create a group
    await pageA.locator("aside").getByText("Your Groups").click();
    await pageA.click("text=New Group");
    
    const groupNameInput = pageA.getByPlaceholder("Enter group name");
    await groupNameInput.fill("Rejoin Test Group");
    await groupNameInput.press("Enter");

    // Wait for group creation sync to finish and replace temporary ID with DB ID
    await pageA.waitForTimeout(3000);

    // Add friend "Husky"
    await pageA.locator("text=+ Friend").first().click();
    const friendNameInput = pageA.getByPlaceholder("e.g. Rahul S, Priya...");
    await friendNameInput.fill("Husky");
    await friendNameInput.press("Enter");
    await pageA.click("text=Add 1 Friend");
    
    // Copy invite link and join in Page B
    await pageA.click("text=Copy");
    const inviteLink = await pageA.evaluate(() => navigator.clipboard.readText());
    await pageA.click("text=Done");
    
    // Wait for member addition to sync to Supabase
    await pageA.waitForTimeout(3000);
    
    // Context B (Invitee - Husky Guest) - Completely Isolated
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    
    pageB.on("console", (msg) => {
      console.log(`[PAGE B CONSOLE] ${msg.type()}: ${msg.text()}`);
    });
    pageB.on("response", (res) => {
      if (res.status() >= 400) {
        console.log(`[PAGE B HTTP ERROR] ${res.url()} returned status ${res.status()}`);
      }
    });

    // Accept welcome alert dialog on page B globally
    pageB.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    // Establish origin first, clear state, set testing flag, then load invite link
    await pageB.goto("/");
    await pageB.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("divido_e2e_testing", "true");
    });
    await pageB.goto(inviteLink);
    
    await pageB.waitForTimeout(2000);
    console.log("PAGE B (REJOIN) URL:", pageB.url());

    await pageB.getByRole("button").filter({ hasText: "Husky" }).first().click();

    // Give database write a brief moment to settle, then reload page A to pull the claimed status
    await pageB.waitForTimeout(1500);
    await pageA.reload();
    await pageA.waitForTimeout(2000);

    // Expand Your Groups sidebar section post-reload since its state resets
    await pageA.locator("aside").getByText("Your Groups").click();
    await pageA.waitForTimeout(500);

    // User A removes Husky
    await pageA.locator("aside").getByText("Rejoin Test Group").click();
    
    // Open Members modal
    await pageA.locator("text=Members").first().click();
    
    // Accept confirm remove prompt using one-shot listener
    pageA.once("dialog", async (dialog) => {
      await dialog.accept();
    });
    // Click remove icon next to Husky using title attribute
    await pageA.getByTitle("Remove member").first().click();

    // Wait for Supabase database write to finish completely
    await pageA.waitForTimeout(3000);

    // Check Husky is now in Past Members (wait for UI to update)
    await expect(pageA.locator("text=Past Members")).toBeVisible({ timeout: 10000 });
    await expect(pageA.locator("text=husky")).toBeVisible();

    // Click Invite again to show the custom sharing modal
    await pageA.click("text=Invite again");
    await pageA.waitForTimeout(1000);
    
    // Click Copy inside the modal on Page A to copy the custom rejoin URL
    await pageA.click("text=Copy");
    const rejoinLink = await pageA.evaluate(() => navigator.clipboard.readText());
    expect(rejoinLink).toContain("rejoinName");
    
    // Click Done to dismiss the modal on Page A
    await pageA.click("text=Done");
    await pageA.waitForTimeout(1000);
    
    // Clean and go to rejoinLink on pageB (utilizes the global welcome alert handler from before)
    await pageB.goto("/");
    await pageB.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("divido_e2e_testing", "true");
    });

    await pageB.goto(rejoinLink);
    await pageB.waitForTimeout(2000);

    // Click the Rejoin button inside the Profile Claiming Modal (use single quotes to avoid escaping conflict)
    await pageB.click('text=Rejoin as "Husky"');
    await pageB.waitForTimeout(2000);

    // Verify Husky auto-logs in and details page displays
    await expect(pageB.locator("text=Rejoin Test Group").first()).toBeVisible();

    // Open Members modal on page B to expose Husky (me)
    await pageB.locator("text=Members").first().click();
    await pageB.waitForTimeout(500);

    // Assert Husky is now listed as the active me user
    await expect(pageB.locator("text=Husky (me)")).toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});
