import { expect, test } from "@playwright/test";
import { applySeed, LIVING_SESSION_ID } from "./helpers/storageSeed";

test("quick-start setup path flows into record and compare winner output", async ({ page }) => {
  await applySeed(page);
  await page.goto("/setup?mode=ab");

  await expect(page.getByRole("heading", { name: "Quick Start Ready" })).toBeVisible();
  await page.getByRole("button", { name: "Continue to Record" }).click();

  await expect(page).toHaveURL(/\/record\?mode=ab/);
  await expect(page.getByRole("heading", { name: "Record" })).toBeVisible();

  await page.goto(`/compare?mode=ab&session=${LIVING_SESSION_ID}`);
  await expect(page).toHaveURL(new RegExp(`/compare\\?mode=ab&session=${LIVING_SESSION_ID}`));

  await expect(page.getByText(/Placement B wins:/)).toBeVisible();
});
