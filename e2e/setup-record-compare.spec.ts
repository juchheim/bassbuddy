import { expect, test } from "@playwright/test";
import { applySeed, LIVING_SESSION_ID } from "./helpers/storageSeed";

test("quick-start setup path flows into record and compare winner output", async ({ page }) => {
  await applySeed(page);
  await page.goto("/setup?mode=ab");

  await expect(page.getByRole("heading", { name: "Quick Start Ready" })).toBeVisible();
  await page.getByRole("button", { name: "Continue to Record" }).click();

  await expect(page).toHaveURL(/\/record\?mode=ab/);
  await expect(page.getByRole("heading", { name: "Session Context" })).toBeVisible();
  await expect(page.getByText(/This mode: 2 runs \| Session total: 4 runs/)).toBeVisible();

  await page.getByRole("link", { name: "Open Compare" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/compare\\?mode=ab&session=${LIVING_SESSION_ID}`));
  await page.getByLabel("Compare strategy").selectOption("single");

  await expect(page.getByText(/Placement B wins:/)).toBeVisible();
});
