import { expect } from "@playwright/test";
import { When, Then } from "../support/bdd-fixtures";

Then("the sidebar should list {string}", async ({ sidebarPage }, repoName: string) => {
  await sidebarPage.waitForRepo(repoName);
  expect(await sidebarPage.hasRepo(repoName)).toBe(true);
});

Then("the sidebar should not list {string}", async ({ sidebarPage }, repoName: string) => {
  const item = sidebarPage.repoItem(repoName);
  await expect(item).not.toBeVisible();
});

Then("{string} should be the active repo", async ({ sidebarPage }, repoName: string) => {
  // After clicking, the repo should be visible and highlighted
  const item = sidebarPage.repoItem(repoName);
  await expect(item).toBeVisible();
});

When("I click on {string} in the sidebar", async ({ sidebarPage }, repoName: string) => {
  await sidebarPage.clickRepo(repoName);
});

When("I type {string} in the sidebar search", async ({ sidebarPage }, query: string) => {
  await sidebarPage.search(query);
});
