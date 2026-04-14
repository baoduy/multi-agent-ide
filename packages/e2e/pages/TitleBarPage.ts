import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the title bar with tab navigation.
 */
export class TitleBarPage {
  constructor(private page: Page) {}

  tabButton(label: string): Locator {
    return this.page.locator("button", { hasText: label });
  }

  newSessionButton(): Locator {
    // The "+" button next to AI tab or title bar new session button
    return this.page.locator('button[title="New AI Session"]');
  }

  async clickTab(label: string): Promise<void> {
    await this.tabButton(label).click();
  }

  /**
   * Check if a tab is "active" — active tabs use the default variant (filled),
   * inactive tabs use the outline variant. We detect by checking the visual state.
   */
  async isTabActive(label: string): Promise<boolean> {
    const btn = this.tabButton(label);
    await btn.waitFor({ state: "visible" });
    // Active tab buttons have data-state="active" or a distinct background
    // We'll check for aria-selected or a class pattern
    const ariaSelected = await btn.getAttribute("aria-selected");
    if (ariaSelected !== null) {
      return ariaSelected === "true";
    }
    // Fallback: check if the button has a "default" variant class or specific style
    const cls = await btn.getAttribute("class");
    return cls?.includes("default") ?? false;
  }

  async clickNewSession(): Promise<void> {
    await this.newSessionButton().click();
  }
}
