import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");

async function main() {
  await mkdir(distDir, { recursive: true });

  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  const distPackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    main: "index.html",
    logseq: packageJson.logseq,
  };

  await writeFile(
    path.join(distDir, "package.json"),
    `${JSON.stringify(distPackageJson, null, 2)}\n`,
    "utf8",
  );

  const indexHtmlPath = path.join(distDir, "index.html");
  const indexHtml = await readFile(indexHtmlPath, "utf8");
  const normalizedIndexHtml = indexHtml
    .replace(/src="\/assets\//g, 'src="./assets/')
    .replace(/href="\/assets\//g, 'href="./assets/');
  await writeFile(indexHtmlPath, normalizedIndexHtml, "utf8");

  await cp(path.join(projectRoot, "icon.svg"), path.join(distDir, "icon.svg"), {
    force: true,
  });
}

main().catch((error) => {
  console.error("prepare-dist failed", error);
  process.exitCode = 1;
});
