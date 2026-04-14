import type { ElectronApplication } from "@playwright/test";

/**
 * Monkey-patches dialog.showOpenDialog in the Electron main process
 * to return the given directory path without showing a native dialog.
 */
export async function mockFolderDialog(app: ElectronApplication, returnPath: string): Promise<void> {
  await app.evaluate(async ({ dialog }, dirPath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [dirPath],
    });
  }, returnPath);
}

/**
 * Monkey-patches dialog.showOpenDialog to simulate a user cancellation.
 */
export async function mockFolderDialogCancelled(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ dialog }) => {
    dialog.showOpenDialog = async () => ({
      canceled: true,
      filePaths: [],
    });
  });
}
