import { sendOrThrow } from "../../services/ipcClient";
import { dirnameOf, stripExtension } from "./fileViewerUtils";

/**
 * Build an image upload handler bound to a particular markdown file.
 *
 * Called from the NotionEditor image flow with a `File` (from file picker,
 * paste, or drag-drop). Saves it under `<repo>/assets/` (or the markdown
 * file's own directory if the repo root is unknown) and returns a path
 * relative to the markdown file so the resulting `![](...)` reference stays
 * portable across git clones.
 */
export function makeImageUploadHandler(params: {
  filePath: string;
  repoPath?: string;
}): (image: File) => Promise<string> {
  const { filePath, repoPath } = params;

  return async (image: File) => {
    const assetsDir = repoPath
      ? `${repoPath}/assets`
      : `${dirnameOf(filePath) || "."}/assets`;

    const ext = (() => {
      const fromName = image.name.includes(".")
        ? image.name.slice(image.name.lastIndexOf(".") + 1)
        : "";
      if (fromName) return fromName.toLowerCase();
      const fromType = image.type.split("/")[1] ?? "png";
      return fromType.toLowerCase();
    })();

    const stem = stripExtension(image.name) || "image";
    const safeStem = stem.replace(/[^a-zA-Z0-9_-]+/g, "-");
    const name = `${safeStem}-${Date.now()}.${ext}`;
    const targetPath = `${assetsDir}/${name}`;

    const arrayBuffer = await image.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + chunk)),
      );
    }
    const contentBase64 = btoa(binary);

    await sendOrThrow({
      type: "file:write-binary",
      filePath: targetPath,
      contentBase64,
    });

    const mdDir = dirnameOf(filePath);
    if (mdDir && targetPath.startsWith(`${mdDir}/`)) {
      return targetPath.slice(mdDir.length + 1);
    }
    return targetPath;
  };
}
