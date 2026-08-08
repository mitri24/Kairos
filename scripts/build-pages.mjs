import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceDir = new URL("../web/", import.meta.url);
const outputDir = new URL("../_site/", import.meta.url);
const basePath = `/${process.env.GITHUB_REPOSITORY?.split("/").at(-1) || "Kairos"}`;
const textExtensions = new Set([".css", ".html", ".js", ".json", ".svg", ".webmanifest"]);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(sourceDir, outputDir, { recursive: true });

async function rewriteDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteDirectory(file);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name))) continue;

    const original = await readFile(file, "utf8");
    const rewritten = original.replace(
      /(["'(])\/(?!\/|api(?:\/|["']))/g,
      `$1${basePath}/`,
    );
    if (rewritten !== original) await writeFile(file, rewritten);
  }
}

await rewriteDirectory(outputDir.pathname);
await writeFile(new URL(".nojekyll", outputDir), "");
