import { expect, test } from "@playwright/test";
import { applySeed } from "./helpers/storageSeed";

test("home is simple-first and links to advanced tools", async ({ page }) => {
  await applySeed(page);

  await expect(page.getByRole("heading", { name: "BassBuddy (MVP)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start Baseline" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start A/B" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start Phase Test" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Archive Session" })).toHaveCount(0);

  await page.getByRole("link", { name: "Advanced Tools" }).click();
  await expect(page).toHaveURL("/advanced");
  await expect(page.getByRole("heading", { name: "Advanced Tools" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Fresh Session" })).toBeVisible();
});
