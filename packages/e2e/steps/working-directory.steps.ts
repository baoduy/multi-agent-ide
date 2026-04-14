import { expect } from "@playwright/test";
import { Given, When, Then } from "../support/bdd-fixtures";
import { DataTable } from "playwright-bdd";
import { createTestRepos, createEmptyWorkdir, type TestRepoConfig } from "../support/test-repo";
import { mockFolderDialog, mockFolderDialogCancelled } from "../support/dialog-mock";

// --- Test data setup ---

Given("a test directory exists with git repos:", async ({ tempHome }, table: DataTable) => {
  const rows = table.rows();
  const repos: TestRepoConfig[] = rows.map((row) => ({
    name: row[0],
    branch: row[1],
  }));
  createTestRepos(tempHome, repos);
});

Given("a test directory exists with no git repos", async ({ tempHome }) => {
  createEmptyWorkdir(tempHome);
});

// --- Dialog mocking ---

Given("the native folder dialog will return the test directory path", async ({ electronApp, testWorkdir }) => {
  await mockFolderDialog(electronApp, testWorkdir);
});

Given("the native folder dialog will be cancelled", async ({ electronApp }) => {
  await mockFolderDialogCancelled(electronApp);
});

// --- Actions ---

When("I click {string}", async ({ mainWindow }, label: string) => {
  const btn = mainWindow.locator("button", { hasText: label });
  await btn.click();
});

// --- Assertions ---

Then("I should see the status {string}", async ({ mainWindow }, status: string) => {
  const text = mainWindow.locator(`text=${status}`);
  await expect(text).toBeVisible({ timeout: 20_000 });
});

Then("eventually the dock layout should be visible", async ({ dockMainPage }) => {
  await dockMainPage.waitForVisible(30_000);
});

Then("I should eventually see the error {string}", async ({ mainWindow }, errorText: string) => {
  const el = mainWindow.locator(`text=${errorText}`);
  await expect(el).toBeVisible({ timeout: 30_000 });
});
