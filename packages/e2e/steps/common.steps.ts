import { expect } from "@playwright/test";
import { Given, When, Then } from "../support/bdd-fixtures";
import { DataTable } from "playwright-bdd";
import { createTestRepos, createEmptyWorkdir, type TestRepoConfig } from "../support/test-repo";
import { mockFolderDialog, mockFolderDialogCancelled } from "../support/dialog-mock";

/**
 * Shared Background steps used across multiple features.
 */

// --- App launch with empty home (Welcome page) ---

Given("the app is launched with an empty home directory", async ({ welcomePage }) => {
  await welcomePage.waitForVisible();
});

// --- App launch with pre-configured repos (goes through UI flow) ---

Given("the app has repos configured:", async ({ tempHome, electronApp, welcomePage, dockMainPage }, table: DataTable) => {
  const rows = table.rows();
  const repos: TestRepoConfig[] = rows.map((row) => ({
    name: row[0],
    branch: row[1],
  }));

  const workdir = createTestRepos(tempHome, repos);
  await welcomePage.waitForVisible();

  // Mock the native dialog to return our test workdir
  await mockFolderDialog(electronApp, workdir);

  // Click through the add-directory flow
  await welcomePage.clickAddDirectory();

  // Wait for dock layout to appear (repos discovered)
  await dockMainPage.waitForVisible(30_000);
});

// --- Dock layout visible ---

Given("the dock layout is visible", async ({ dockMainPage }) => {
  await dockMainPage.waitForVisible();
});

// --- Active repo selection ---

Given("{string} is the active repo", async ({ sidebarPage }, repoName: string) => {
  await sidebarPage.waitForRepo(repoName);
  await sidebarPage.clickRepo(repoName);
});
