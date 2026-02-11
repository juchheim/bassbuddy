import { expect, test } from "@playwright/test";
import { LIVING_SESSION_ID, applySeed } from "./helpers/storageSeed";

test("compare and decision can lock winners into session baseline", async ({ page }) => {
  await applySeed(page);
  await page.goto(`/compare?mode=ab&session=${LIVING_SESSION_ID}`);

  await page.getByLabel("Compare strategy").selectOption("single");
  await page.getByLabel("Baseline lock notes (optional)").fill("Seat-level winner confirmed.");
  await page.getByRole("button", { name: "Lock Placement Winner" }).click();
  await expect(page.getByText(/Locked placement baseline as "Placement B"/)).toBeVisible();

  await page.goto("/");
  await expect(page.getByText(/Locked placement baseline:\s*Placement B/)).toBeVisible();
  await expect(page.getByText(/Locked phase baseline:\s*Not locked/)).toBeVisible();

  await page.goto("/decision");
  await page.getByLabel("Baseline lock notes (optional)").fill("Decision assistant final lock.");
  await page.getByRole("button", { name: "Lock Current Winners as Baseline" }).click();
  await expect(page.getByText(/Locked current winners for session/)).toBeVisible();

  await page.goto("/");
  await expect(page.getByText(/Locked placement baseline:\s*Placement B/)).toBeVisible();
  await expect(page.getByText(/Locked phase baseline:\s*Phase 180/)).toBeVisible();
});
