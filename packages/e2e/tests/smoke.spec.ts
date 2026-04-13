import { test, expect } from "./fixtures";

test("app launches, renderer loads, window has a title", async ({ mainWindow }) => {
  // Renderer loaded an HTML document.
  const title = await mainWindow.title();
  expect(typeof title).toBe("string");

  // The <body> eventually has some mounted React content.
  await mainWindow.waitForSelector("body *", { timeout: 15_000 });

  const bodyHtml = await mainWindow.evaluate(() => document.body.innerHTML.length);
  expect(bodyHtml).toBeGreaterThan(0);
});
