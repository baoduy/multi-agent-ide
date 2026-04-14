import { expect } from "@playwright/test";
import { When, Then } from "../support/bdd-fixtures";

When("I open the new session dialog", async ({ titleBarPage }) => {
  await titleBarPage.clickNewSession();
});

Then("the {string} dialog should be visible", async ({ newSessionDialog }, _title: string) => {
  await newSessionDialog.waitForVisible();
  expect(await newSessionDialog.isVisible()).toBe(true);
});

Then("the {string} dialog should not be visible", async ({ newSessionDialog }, _title: string) => {
  await newSessionDialog.waitForHidden();
  expect(await newSessionDialog.isVisible()).toBe(false);
});

Then("{string} should be the default session type", async ({ newSessionDialog }, type: string) => {
  const btn = newSessionDialog.sessionTypeButton(type);
  await expect(btn).toBeVisible();
});

When("I click {string} session type", async ({ newSessionDialog }, type: string) => {
  await newSessionDialog.selectSessionType(type);
});

Then("the provider picker should not be visible", async ({ newSessionDialog }) => {
  const picker = newSessionDialog.providerPicker();
  await expect(picker).not.toBeVisible();
});

// Note: "I click {string}" step is defined in working-directory.steps.ts
