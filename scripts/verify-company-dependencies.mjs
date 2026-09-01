import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenPackages = ["@openai/codex-sdk", "@openai/codex"];

const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const dependencyGroups = [
  packageJson.dependencies ?? {},
  packageJson.devDependencies ?? {},
  packageJson.optionalDependencies ?? {},
  packageJson.peerDependencies ?? {},
];
for (const dependency of forbiddenPackages) {
  if (dependencyGroups.some((group) => Object.hasOwn(group, dependency))) {
    throw new Error(`Company package declares forbidden dependency: ${dependency}`);
  }
}

const lock = JSON.parse(await readFile(path.join(projectRoot, "package-lock.json"), "utf8"));
for (const key of Object.keys(lock.packages ?? {})) {
  if (forbiddenPackages.some((dependency) => key === `node_modules/${dependency}`)) {
    throw new Error(`Company lockfile contains forbidden dependency: ${key}`);
  }
}

async function sourceFiles(root) {
  const files = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return files;
    throw error;
  }
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(target));
    else if (entry.isFile() && /\.(?:ts|js|mjs)$/.test(entry.name)) files.push(target);
  }
  return files;
}

const companyCodeFiles = [
  ...await sourceFiles(path.join(projectRoot, "src")),
  ...await sourceFiles(path.join(projectRoot, "dist", "src")),
];
for (const filename of companyCodeFiles) {
  const source = await readFile(filename, "utf8");
  if (forbiddenPackages.some((dependency) => source.includes(dependency))) {
    throw new Error(`Company source imports a forbidden dependency: ${path.relative(projectRoot, filename)}`);
  }
}

if (!Array.isArray(packageJson.files) || packageJson.files.some((entry) => entry.startsWith("providers"))) {
  throw new Error("Company npm package must exclude the optional providers directory");
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const packOutput = execFileSync(npmCommand, ["pack", "--dry-run", "--json"], {
  cwd: projectRoot,
  encoding: "utf8",
});
const packFiles = JSON.parse(packOutput)[0]?.files?.map((entry) => entry.path) ?? [];
const forbiddenPackFiles = packFiles.filter((filename) =>
  filename.startsWith("providers/") || /(?:^|\/)codex-(?:auth|runner)\./.test(filename)
);
if (forbiddenPackFiles.length > 0) {
  throw new Error(`Company npm package contains Codex files: ${forbiddenPackFiles.join(", ")}`);
}

console.log("Company dependency boundary verified: no Codex package in manifest, lockfile, core source, build, or npm package.");
