import { expect, test } from "@playwright/test";
import { applySeed } from "./helpers/storageSeed";

test("full session bundle export/import restores data after fresh reset", async ({ page }, testInfo) => {
  await applySeed(page);
  await page.goto("/advanced");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export Full Session Bundle (JSON)" }).click()
  ]);

  const bundlePath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(bundlePath);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Start Fresh Session" }).click();
  await expect(page.getByText("Total saved runs: 0")).toBeVisible();

  await page.setInputFiles('input[type="file"]', bundlePath);
  await page.getByRole("button", { name: "Import Session JSON" }).click();

  await expect(page.getByText(/Imported full bundle/)).toBeVisible();
  await expect(page.getByText(/Total saved runs: 4/)).toBeVisible();
});
