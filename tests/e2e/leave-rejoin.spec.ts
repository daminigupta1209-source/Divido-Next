import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const envContent = fs.readFileSync(".env", "utf8");
const anonKeyLine = envContent.split("\n").find(l => l.trim().startsWith("VITE_SUPABASE_ANON_KEY="));
const anonKey = anonKeyLine ? anonKeyLine.split("=")[1].trim().replace(/['";]/g, "") : "";
const supabase = createClient("https://nxpiitewjlwernaysupm.supabase.co", anonKey);

test.beforeEach(async () => {
  const testEmails = [
    "e2e-test-inviter@divido.app",
    "e2e-test-invitee@divido.app",
    "e2e-test-guest@divido.app",
    "e2e-realtime-husky@divido.app",
    "e2e-past-member-ui@divido.app"
  ];
  const { data: mems } = await supabase
    .from("group_members")
    .select("group_id")
    .in("user_email", testEmails);
  if (mems && mems.length > 0) {
    const groupIds = Array.from(new Set(mems.map((m: any) => m.group_id).filter(Boolean)));
    await supabase.from("groups").delete().in("id", groupIds);
  }
});

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
      localStorage.setItem("divido_mock_email", "e2e-test-inviter@divido.app");
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
      localStorage.setItem("divido_mock_email", "e2e-test-invitee@divido.app");
    });
    await pageB.goto(inviteLink);
    
    await pageB.waitForTimeout(2000);
    console.log("PAGE B (REJOIN) URL:", pageB.url());

    await pageB.getByRole("button").filter({ hasText: "Husky" }).first().click({ force: true });

    // Give database write a brief moment to settle, then reload page A to pull the claimed status
    await pageB.waitForTimeout(1500);
    await pageA.reload();
    await pageA.waitForTimeout(2000);

    // User A selects Rejoin Test Group from the dashboard
    await pageA.locator("text=Rejoin Test Group").first().click();
    
    // Open Members modal
    await pageA.locator("text=Members").first().click();
    
    pageA.once("dialog", async (dialog) => {
      console.log(`[E2E TEST] Page A dialog event fired: ${dialog.type()} - ${dialog.message()}`);
      await dialog.accept();
    });
    // Click remove icon next to Husky using title attribute
    const removeBtn = pageA.locator('span[title="Remove member"]').first();
    await expect(removeBtn).toBeVisible({ timeout: 5000 });
    await removeBtn.click();

    // Wait for Supabase database write to finish completely
    await pageA.waitForTimeout(3000);
    await pageA.reload();
    await pageA.waitForTimeout(3000);
    await pageA.locator("text=Rejoin Test Group").first().click();
    await pageA.locator("text=Members").first().click();

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
      localStorage.setItem("divido_mock_email", "e2e-test-invitee@divido.app");
      localStorage.setItem("divido_username", "Husky");
    });

    await pageB.goto(rejoinLink);
    await pageB.waitForTimeout(2000);

    await pageB.getByRole("button", { name: /Rejoin/i }).first().click({ force: true });
    await pageB.waitForTimeout(3000);

    // Reload page to dashboard to pull fresh database state
    await pageB.goto("/");
    await pageB.waitForTimeout(3000);

    // Verify Husky auto-logs in and details page displays by clicking the group card
    await pageB.locator("text=Rejoin Test Group").first().click();
    await expect(pageB.locator("text=Rejoin Test Group").first()).toBeVisible();

    // Open Members modal on page B to expose Husky (me)
    await pageB.locator("text=Members").first().click();
    await pageB.waitForTimeout(500);

    // Assert Husky is now listed as the active me user
    await expect(pageB.locator("text=You").first()).toBeVisible();

    await contextA.close();
    await contextB.close();
  });

  test("Proactive rejoin request flow should show read-only details and require Admin approval", async ({ browser }) => {
    test.setTimeout(60000);

    // Context A (Admin / Inviter)
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

    await pageA.goto("/");
    await pageA.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("divido_e2e_testing", "true");
      localStorage.setItem("divido_mock_email", "e2e-test-inviter@divido.app");
    });
    await pageA.reload();
    await pageA.waitForTimeout(3000);

    const googleBtn = pageA.getByRole("button", { name: "Continue with Google" });
    if (await googleBtn.isVisible()) {
      await googleBtn.click();
      await pageA.waitForTimeout(2000);
    }

    // Create a group
    await pageA.getByTitle("New group").first().click();
    const groupNameInput = pageA.getByPlaceholder("Enter group name");
    await groupNameInput.fill("Proactive Rejoin Group");
    await groupNameInput.press("Enter");
    await pageA.waitForTimeout(3000);

    // Add friend "Husky"
    await pageA.locator("text=+ Friend").first().click();
    const friendNameInput = pageA.getByPlaceholder("e.g. Rahul S, Priya...");
    await friendNameInput.fill("Husky");
    await friendNameInput.press("Enter");
    await pageA.click("text=Add 1 Friend");
    
    // Copy invite link
    await pageA.click("text=Copy");
    const inviteLink = await pageA.evaluate(() => navigator.clipboard.readText());
    await pageA.click("text=Done");
    await pageA.waitForTimeout(3000);

    // Context B (Invitee - Husky)
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

    pageB.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await pageB.goto("/");
    await pageB.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("divido_e2e_testing", "true");
      localStorage.setItem("divido_mock_email", "e2e-test-invitee@divido.app");
    });
    await pageB.goto(inviteLink);
    await pageB.waitForTimeout(2000);

    // Claim nickname
    await pageB.getByRole("button").filter({ hasText: "Husky" }).first().click();
    await pageB.waitForTimeout(2000);

    // Reload page A to fetch updated members
    await pageA.reload();
    await pageA.waitForTimeout(2000);

    // B decides to leave the group
    await pageB.locator("text=Proactive Rejoin Group").first().click();
    await pageB.waitForTimeout(1000);
    await pageB.getByTitle("Group options").first().click();
    await pageB.waitForTimeout(500);
    await pageB.locator("text=Leave Group").first().click();
    await pageB.waitForTimeout(500);
    await pageB.getByRole("button", { name: "Confirm" }).first().click();
    await expect(pageB.getByRole("button", { name: "Confirm" })).toBeHidden({ timeout: 10000 });

    // Assert read-only banner is visible on Page B
    await pageB.locator("text=Proactive Rejoin Group").first().click();
    await pageB.waitForTimeout(1000);
    await expect(pageB.locator("#past-member-banner")).toContainText("You have left this group. Showing past history.");

    // === View-only guards: a left member must not be able to edit the group ===
    const rejoinModalText = "Rejoin this group?";
    const closeRejoinModal = async () => {
      await pageB
        .locator("div.card", { hasText: "Rejoin this group" })
        .getByRole("button")
        .filter({ hasText: "✕" })
        .first()
        .click({ force: true });
      await pageB.waitForTimeout(500);
    };

    // Clicking the Rejoin button must surface the rejoin modal
    await pageB.locator("text=Rejoin").first().click({ force: true });
    await expect(pageB.locator(`text=${rejoinModalText}`)).toBeVisible({ timeout: 10000 });
    await closeRejoinModal();

    // The desktop-add-expense-btn is hidden for left members (write-lock), so verify it's not visible
    await expect(pageB.locator("#desktop-add-expense-btn")).not.toBeVisible();

    // Open the rejoin modal again and submit the request
    await pageB.locator("text=Rejoin").first().click({ force: true });
    await expect(pageB.locator(`text=${rejoinModalText}`)).toBeVisible({ timeout: 10000 });

    // Click "Send request" inside the rejoin modal
    await pageB.getByRole("button", { name: "Send request" }).first().click();
    await pageB.waitForTimeout(2000);
    await pageB.goto("/");
    await pageB.waitForTimeout(3000);
    await pageB.locator("text=Proactive Rejoin Group").first().click();
    await pageB.waitForTimeout(1000);

    // Assert Banner text updates to pending
    await expect(pageB.locator("#past-member-banner")).toContainText("Rejoin request pending approval. Showing past history.");

    // Page A (Admin) should show proactive rejoin request notification on reload
    await pageA.reload();
    await pageA.waitForTimeout(3000);
    await expect(pageA.locator("text=Husky wants to rejoin Proactive Rejoin Group")).toBeVisible({ timeout: 10000 });

    // Admin clicks Approve
    await pageA.getByRole("button", { name: "Approve" }).first().click();
    await pageA.waitForTimeout(3000);

    // Page B reloads and should no longer see the left banner
    await pageB.reload();
    await pageB.waitForTimeout(3000);
    await pageB.locator("text=Proactive Rejoin Group").first().click();
    await pageB.waitForTimeout(1000);
    await expect(pageB.locator("#past-member-banner")).not.toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});
