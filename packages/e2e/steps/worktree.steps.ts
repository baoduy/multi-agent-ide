import { expect } from "@playwright/test";
import { Then } from "../support/bdd-fixtures";

Then("I should see the worktrees view", async ({ mainWindow }) => {
  // The worktrees view shows a list or empty state for worktrees
  const view = mainWindow.locator("text=/Worktrees|No worktrees/i");
  await expect(view).toBeVisible({ timeout: 10_000 });
});
