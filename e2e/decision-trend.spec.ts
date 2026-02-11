import { expect, test } from "@playwright/test";
import { applySeed } from "./helpers/storageSeed";

test("saving a decision snapshot updates decision session summary", async ({ page }) => {
  await applySeed(page);
  await page.goto("/decision");

  await expect(page.getByRole("heading", { name: "Final Decision Assistant" })).toBeVisible();
  await page.getByRole("button", { name: "Save Snapshot" }).click();
  await expect(page.getByText("Saved decision snapshot.")).toBeVisible();
  await expect(page.getByText(/Snapshot count in session:\s*1\./)).toBeVisible();
});
