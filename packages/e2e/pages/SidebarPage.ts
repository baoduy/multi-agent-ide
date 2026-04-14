import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the sidebar containing repos and search.
 */
export class SidebarPage {
  readonly searchInput: Locator;

  constructor(private page: Page) {
    this.searchInput = page.locator('input[placeholder="Repositories"]');
  }

  repoItem(name: string): Locator {
    return this.page.locator("button", { hasText: name });
  }

  async clickRepo(name: string): Promise<void> {
    await this.repoItem(name).click();
  }

  async hasRepo(name: string): Promise<boolean> {
    return this.repoItem(name).isVisible();
  }

  async waitForRepo(name: string, timeout = 20_000): Promise<void> {
    await this.repoItem(name).waitFor({ state: "visible", timeout });
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }
}
