import { expect, test } from "@playwright/test";
import { applySeed } from "./helpers/storageSeed";

test("home supports session archive and restore with summary", async ({ page }) => {
  await applySeed(page);

  await expect(page.getByRole("heading", { name: "Sub Placement Coach" })).toBeVisible();
  await expect(page.getByText(/Active session:\s*Living Room Test/)).toBeVisible();
  await expect(page.getByText(/Best A\/B result:\s*Placement B/)).toBeVisible();
  await expect(page.getByText(/Best phase result:\s*Phase 180/)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Archive Session" }).click();
  await expect(page.getByText(/Archived "Living Room Test"/)).toBeVisible();

  await page.getByRole("button", { name: /Show Archived Sessions/ }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText(/Restored "Living Room Test"/)).toBeVisible();
});
