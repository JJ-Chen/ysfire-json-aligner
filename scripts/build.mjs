import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const destination = new URL("dist/", root);
await mkdir(destination, { recursive: true });
for (const file of ["manifest.json", "background.js", "index.html", "styles.css"]) {
  await cp(new URL(`extension/${file}`, root), new URL(file, destination));
}
await cp(new URL("extension/_locales", root), new URL("_locales", destination), { recursive: true });
await cp(new URL("extension/icons", root), new URL("icons", destination), { recursive: true });
await cp(
  new URL("node_modules/jsonc-parser/LICENSE.md", root),
  new URL("THIRD-PARTY-NOTICES.txt", destination),
);
await build({
  entryPoints: [fileURLToPath(new URL("src/app.js", root))],
  outfile: fileURLToPath(new URL("app.js", destination)),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome109",
  legalComments: "eof",
});
console.log("Built extension in dist");
