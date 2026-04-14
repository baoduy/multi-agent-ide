import { expect } from "@playwright/test";
import { When, Then } from "../support/bdd-fixtures";

When("I click the {string} tab", async ({ titleBarPage }, tabName: string) => {
  await titleBarPage.clickTab(tabName);
});

Then("the {string} tab should be active", async ({ titleBarPage }, tabName: string) => {
  const isActive = await titleBarPage.isTabActive(tabName);
  expect(isActive).toBe(true);
});
