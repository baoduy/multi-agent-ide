import { expect } from "@playwright/test";
import { Then } from "../support/bdd-fixtures";

Then("I should see the heading {string}", async ({ mainWindow }, heading: string) => {
  const h1 = mainWindow.locator("h1", { hasText: heading });
  await expect(h1).toBeVisible({ timeout: 15_000 });
});

Then("I should see a button labeled {string}", async ({ mainWindow }, label: string) => {
  const btn = mainWindow.locator("button", { hasText: label });
  await expect(btn).toBeVisible();
});

Then("I should see the tip about scanning 3 levels deep", async ({ mainWindow }) => {
  const tip = mainWindow.locator("text=scan up to 3 levels deep");
  await expect(tip).toBeVisible();
});

Then("the {string} button should be enabled", async ({ mainWindow }, label: string) => {
  const btn = mainWindow.locator("button", { hasText: label });
  await expect(btn).toBeEnabled();
});

Then("I should still see the heading {string}", async ({ mainWindow }, heading: string) => {
  const h1 = mainWindow.locator("h1", { hasText: heading });
  await expect(h1).toBeVisible();
});
