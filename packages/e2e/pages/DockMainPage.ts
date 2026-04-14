import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the main dock layout page.
 * Visible after repos are configured and the welcome page transitions.
 */
export class DockMainPage {
  readonly sidebarSearchInput: Locator;

  constructor(private page: Page) {
    this.sidebarSearchInput = page.locator('input[placeholder="Repositories"]');
  }

  async waitForVisible(timeout = 30_000): Promise<void> {
    await this.sidebarSearchInput.waitFor({ state: "visible", timeout });
  }

  async isVisible(): Promise<boolean> {
    return this.sidebarSearchInput.isVisible();
  }
}
