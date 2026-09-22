import { readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import archiver from "archiver";
import { createWriteStream } from "node:fs";

const root = new URL("../", import.meta.url);
const packageJsonUrl = new URL("package.json", root);
const manifestJsonUrl = new URL("extension/manifest.json", root);
const changelogUrl = new URL("CHANGELOG.md", root);
const distUrl = new URL("dist/", root);

const BUMP_KINDS = new Set(["patch", "minor", "major"]);
const SEMVER = /^\d+\.\d+\.\d+$/;
const MARKER_PATTERN = /<!-- last-release-commit: ([0-9a-f]+) -->/;

/**
 * @param {string} version
 * @param {string} kind
 */
function bumpVersion(version, kind) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * @param {URL} fileUrl
 */
async function readJson(fileUrl) {
  return JSON.parse(await readFile(fileUrl, "utf8"));
}

/**
 * @param {URL} fileUrl
 * @param {object} data
 */
async function writeJson(fileUrl, data) {
  await writeFile(fileUrl, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/**
 * @param {string} label
 * @param {string} command
 * @param {string[]} args
 */
function run(label, command, args) {
  console.log(`> ${label}`);
  // npm on Windows is a .cmd shim, which requires a shell to execute. Passing a single
  // pre-joined command string (rather than a shell:true + args array) avoids Node's
  // DEP0190 warning; the parts here are always our own hardcoded literals.
  const useShell = process.platform === "win32";
  const result = useShell
    ? spawnSync([command, ...args].join(" "), { stdio: "inherit", shell: true })
    : spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${label} 失败（退出码 ${result.status}）`);
  }
}

/**
 * @param {string[]} args
 */
function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `git ${args.join(" ")} 失败`);
  }
  return result.stdout.trim();
}

/**
 * 读取现有 CHANGELOG.md，解析上次发布记录的提交哈希（若存在）
 */
async function readChangelog() {
  try {
    const content = await readFile(changelogUrl, "utf8");
    return { content, marker: content.match(MARKER_PATTERN)?.[1] ?? null };
  } catch {
    return { content: "# 更新日志\n", marker: null };
  }
}

/**
 * 收集自上次发布以来的原始素材，仅供人工/Agent 整理发布说明，不直接写入更新日志
 * @param {string | null} previousCommit
 */
function collectMaterial(previousCommit) {
  const range = previousCommit ? `${previousCommit}..HEAD` : "HEAD";
  const log = git(["log", "--no-merges", "--pretty=format:%h %s", range]);
  const commits = log ? log.split("\n").filter(Boolean) : [];
  const diffArgs = previousCommit
    ? ["diff", "--stat", `${previousCommit}..HEAD`]
    : ["show", "--stat", "--pretty=format:", "HEAD"];
  return { range, commits, diffStat: git(diffArgs) };
}

/**
 * 输出发布素材，供 Agent 整理成对外发布说明；不修改任何文件
 * @param {string | null} previousCommit
 */
function showMaterial(previousCommit) {
  const { range, commits, diffStat } = collectMaterial(previousCommit);
  console.log(`上次发布提交: ${previousCommit ?? "（无，本次为首次发布）"}`);
  console.log(`统计范围: ${range}\n`);
  console.log(`提交记录（${commits.length} 条，仅作素材，不要直接抄进更新日志）:`);
  console.log(commits.length ? commits.map((line) => `  ${line}`).join("\n") : "  （无新提交）");
  console.log(`\n改动文件:\n${diffStat || "  （无改动）"}`);
  console.log("\n请据此整理面向用户的发布说明，再通过 --notes <文件> 传入。");
}

/**
 * 校验发布说明：必须存在、非空，且不是提交记录的逐条照搬
 * @param {string} notes
 * @param {string[]} commits
 */
function assertCuratedNotes(notes, commits) {
  const body = notes.trim();
  if (!body) {
    throw new Error("发布说明为空，请先整理面向用户的更新内容");
  }
  const bullets = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
  const subjects = new Set(commits.map((line) => line.replace(/^[0-9a-f]+ /, "")));
  if (bullets.length > 0 && bullets.every((bullet) => subjects.has(bullet))) {
    throw new Error("发布说明与提交记录逐条相同，请改写成面向用户的表述后再发布");
  }
  return body;
}

/**
 * 将整理好的发布说明写入 CHANGELOG.md，并更新“上次发布提交”标记
 * @param {string} version
 * @param {string} notes
 */
async function writeChangelog(version, notes) {
  const { content } = await readChangelog();
  const headHash = git(["rev-parse", "HEAD"]);
  const date = new Date().toISOString().slice(0, 10);
  const entry = `## [${version}] - ${date}\n\n${notes}`;

  const markerMatch = content.match(MARKER_PATTERN);
  let title;
  let history;
  if (markerMatch) {
    const markerIndex = content.indexOf(markerMatch[0]);
    title = content.slice(0, markerIndex).trim();
    history = content.slice(markerIndex + markerMatch[0].length).trim();
  } else {
    const firstLineEnd = content.indexOf("\n");
    title = (firstLineEnd === -1 ? content : content.slice(0, firstLineEnd)).trim() || "# 更新日志";
    history = (firstLineEnd === -1 ? "" : content.slice(firstLineEnd + 1)).trim();
  }

  // 新版本条目插入在标记之后、历史记录之前，最新版本始终排在最前
  const sections = [title, `<!-- last-release-commit: ${headHash} -->`, entry];
  if (history) sections.push(history);

  await writeFile(changelogUrl, `${sections.join("\n\n")}\n`, "utf8");
  return fileURLToPath(changelogUrl);
}

async function zipDist(version) {
  const zipUrl = new URL(`JsonAligner-${version}.zip`, root);
  const zipPath = fileURLToPath(zipUrl);
  await rm(zipUrl, { force: true });

  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(fileURLToPath(distUrl), false);
    archive.finalize();
  });

  return zipPath;
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  let version = null;
  let notesPath = null;
  let showChanges = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--show-changes") {
      showChanges = true;
    } else if (arg === "--notes") {
      notesPath = argv[index + 1] ?? null;
      index += 1;
      if (!notesPath) throw new Error("--notes 需要指定发布说明文件路径");
    } else if (arg.startsWith("--")) {
      throw new Error(`未知参数：${arg}`);
    } else if (version === null) {
      version = arg;
    } else {
      throw new Error(`多余参数：${arg}`);
    }
  }
  return { version: version ?? "patch", notesPath, showChanges };
}

async function main() {
  const { version: versionArg, notesPath, showChanges } = parseArgs(process.argv.slice(2));
  const { marker: previousCommit } = await readChangelog();

  if (showChanges) {
    showMaterial(previousCommit);
    return;
  }

  const kind = BUMP_KINDS.has(versionArg) ? versionArg : null;
  if (!kind && !SEMVER.test(versionArg)) {
    throw new Error(`版本参数无效："${versionArg}"，请使用 patch / minor / major 或形如 1.2.3 的版本号`);
  }
  if (!notesPath) {
    throw new Error(
      "缺少发布说明：请先运行 `npm run release -- --show-changes` 查看素材，" +
        "整理成面向用户的更新内容后，通过 `--notes <文件>` 传入",
    );
  }

  const notesRaw = await readFile(notesPath, "utf8");
  const { commits } = collectMaterial(previousCommit);
  const notes = assertCuratedNotes(notesRaw, commits);

  const pkg = await readJson(packageJsonUrl);
  const manifest = await readJson(manifestJsonUrl);
  if (pkg.version !== manifest.version) {
    throw new Error(`版本不一致：package.json 为 ${pkg.version}，extension/manifest.json 为 ${manifest.version}`);
  }

  const currentVersion = pkg.version;
  const nextVersion = kind ? bumpVersion(currentVersion, kind) : versionArg;

  // 封板：以当前代码为基线执行类型检查和测试，通过后才允许发布
  run("类型检查 (npm run check)", "npm", ["run", "check"]);
  run("单元测试 (npm test)", "npm", ["test"]);

  pkg.version = nextVersion;
  manifest.version = nextVersion;
  await writeJson(packageJsonUrl, pkg);
  await writeJson(manifestJsonUrl, manifest);
  console.log(`版本号：${currentVersion} -> ${nextVersion}`);

  const changelogPath = await writeChangelog(nextVersion, notes);
  console.log(`已更新更新日志：${changelogPath}`);

  // 版本号已写入 manifest，重新构建以确保 dist 内的产物携带新版本号
  run("构建扩展 (npm run build)", "npm", ["run", "build"]);

  const zipPath = await zipDist(nextVersion);
  console.log(`已发布 zip：${zipPath}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
