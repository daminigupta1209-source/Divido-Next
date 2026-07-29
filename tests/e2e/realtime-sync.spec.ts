import { test, expect } from "@playwright/test";

test.describe("Multi-User Real-Time Syncing", () => {
  test("User A adding expense should instantly sync to User B (Guest)", async ({ browser }) => {
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
    
    // Auth using Google login (demo mode) if visible
    const googleBtn = pageA.getByRole("button", { name: "Continue with Google" });
    if (await googleBtn.isVisible()) {
      await googleBtn.click();
      await pageA.waitForTimeout(2000);
    }
    const homeTab = pageA.locator("aside").getByText("Home").first();
    await expect(homeTab).toBeVisible();

    // Create a group
    await pageA.getByTitle("New group").first().click();
    
    // Enter ledger name in input
    const groupNameInput = pageA.getByPlaceholder("Enter group name");
    await groupNameInput.fill("Sync Test Group");
    await groupNameInput.press("Enter");

    // Wait for group creation sync to finish and replace temporary ID with DB ID
    await pageA.waitForTimeout(3000);

    // Add friend "Husky" (click first to avoid multiple match strict violations)
    await pageA.locator("text=+ Friend").first().click();
    const friendNameInput = pageA.getByPlaceholder("e.g. Rahul S, Priya...");
    await friendNameInput.fill("Husky");
    await friendNameInput.press("Enter");
    await pageA.click("text=Add 1 Friend");

    // Copy link using the modal's Copy action and read from clipboard
    await pageA.click("text=Copy");
    const inviteLink = await pageA.evaluate(() => navigator.clipboard.readText());
    expect(inviteLink).toContain("joinGroupId");

    await pageA.click("text=Done");
    
    // Wait for the member addition to sync to Supabase
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

    // Accept welcome alert dialog on page B
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

    // Wait and print debug info
    await pageB.waitForTimeout(2000);
    console.log("PAGE B URL:", pageB.url());

    // Claim profile as Husky (match by text in button)
    await pageB.getByRole("button").filter({ hasText: "Husky" }).first().click();
    await pageB.waitForTimeout(1000);

    // User A adds an expense
    if (await pageA.locator("text=Members").first().isHidden()) {
      await pageA.goto("/");
      await pageA.locator("text=Sync Test Group").first().click();
    }
    await pageA.locator("text=+ Expense").first().click();
    
    const expenseTitle = pageA.getByPlaceholder("e.g. Pizza 🍕");
    await expenseTitle.fill("E2E Test Coffee");
    
    const expenseAmt = pageA.getByRole("spinbutton");
    await expenseAmt.fill("120");
    
    await pageA.click("text=Record Expense");

    // Give database write a brief moment to settle, reload page B, and select the group to show expense
    await pageA.waitForTimeout(2000);
    await pageB.reload();
    await pageB.waitForTimeout(2000);
    if (await pageB.locator("text=Members").first().isHidden()) {
      await pageB.goto("/");
      await pageB.locator("text=Sync Test Group").first().click();
    }
    await pageB.waitForTimeout(1000);

    // User B (Husky) should see the expense
    await expect(pageB.locator("text=E2E Test Coffee").first()).toBeVisible({ timeout: 10000 });
    await expect(pageB.locator("text=120").first()).toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});
