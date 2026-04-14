import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the Welcome page shown on first launch.
 */
export class WelcomePage {
  readonly heading: Locator;
  readonly addDirectoryButton: Locator;
  readonly tipText: Locator;

  constructor(private page: Page) {
    this.heading = page.locator("h1", { hasText: "Welcome to Magenta IDE" });
    this.addDirectoryButton = page.locator("button", { hasText: /Add Working Directory|Scanning\.\.\./ });
    this.tipText = page.locator("text=scan up to 3 levels deep");
  }

  async waitForVisible(timeout = 30_000): Promise<void> {
    await this.heading.waitFor({ state: "visible", timeout });
  }

  async isVisible(): Promise<boolean> {
    return this.heading.isVisible();
  }

  async clickAddDirectory(): Promise<void> {
    await this.page.locator("button", { hasText: "Add Working Directory" }).click();
  }

  async isButtonEnabled(): Promise<boolean> {
    return this.page.locator("button", { hasText: "Add Working Directory" }).isEnabled();
  }

  statusText(): Locator {
    return this.page.locator("text=/Adding directory\\.\\.\\.|Scanning for repositories\\.\\.\\.|Waiting for scan results\\.\\.\\./ ");
  }

  errorText(): Locator {
    return this.page.locator("text=No git repositories found");
  }

  reposFoundText(): Locator {
    return this.page.locator("text=/Found \\d+ repositor/");
  }
}
