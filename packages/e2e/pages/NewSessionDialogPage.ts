import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the New Session dialog.
 */
export class NewSessionDialogPage {
  constructor(private page: Page) {}

  dialog(): Locator {
    return this.page.locator('[role="dialog"]');
  }

  async isVisible(): Promise<boolean> {
    return this.dialog().isVisible();
  }

  async waitForVisible(timeout = 10_000): Promise<void> {
    await this.dialog().waitFor({ state: "visible", timeout });
  }

  async waitForHidden(timeout = 10_000): Promise<void> {
    await this.dialog().waitFor({ state: "hidden", timeout });
  }

  sessionTypeButton(type: string): Locator {
    return this.dialog().locator("button", { hasText: type });
  }

  async selectSessionType(type: string): Promise<void> {
    await this.sessionTypeButton(type).click();
  }

  providerPicker(): Locator {
    // The provider section (Claude, Copilot dropdown)
    return this.dialog().locator("text=/Claude|Copilot/").first();
  }

  cancelButton(): Locator {
    return this.dialog().locator("button", { hasText: "Cancel" });
  }

  createButton(): Locator {
    return this.dialog().locator("button", { hasText: /Create Agent Session|Open Terminal/ });
  }

  async clickCancel(): Promise<void> {
    await this.cancelButton().click();
  }

  async clickCreate(): Promise<void> {
    await this.createButton().click();
  }

  worktreeNameInput(): Locator {
    return this.dialog().locator('input[placeholder*="auth-review"]');
  }

  newWorktreeOption(): Locator {
    return this.dialog().locator("button", { hasText: "New Worktree" });
  }

  repoSelector(): Locator {
    return this.dialog().locator("text=Select repository").first();
  }
}
