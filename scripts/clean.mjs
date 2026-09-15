import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Detect mode from CLI arguments
const rawArgs = process.argv.slice(2).join(" ").toLowerCase();
const isTotalClean = rawArgs.includes("total");
const isDryRun = rawArgs.includes("dry-run") || rawArgs.includes("dryrun");

const colorReset = "\x1b[0m";
const colorBold = "\x1b[1m";
const colorCyan = "\x1b[36m";
const colorMagenta = "\x1b[35m";
const colorGreen = "\x1b[32m";
const colorYellow = "\x1b[33m";
const colorRed = "\x1b[31m";

console.log("");
if (isTotalClean) {
  console.log(`${colorMagenta}${colorBold}====================================================${colorReset}`);
  console.log(`${colorMagenta}${colorBold}   GPHOSTING: TOTAL CLEAN (STRICT CLEANUP)          ${colorReset}`);
  console.log(`${colorMagenta}${colorBold}   Clearing: .next, node_modules, package-lock.json ${colorReset}`);
  console.log(`${colorMagenta}${colorBold}====================================================${colorReset}`);
} else {
  console.log(`${colorCyan}${colorBold}====================================================${colorReset}`);
  console.log(`${colorCyan}${colorBold}   GPHOSTING: CLEAN (STANDARD CLEANUP)              ${colorReset}`);
  console.log(`${colorCyan}${colorBold}   Clearing: .next, node_modules                    ${colorReset}`);
  console.log(`${colorCyan}${colorBold}====================================================${colorReset}`);
}
console.log("");

// Targets to remove
const targets = [
  { name: ".next", path: path.join(rootDir, ".next"), isDir: true },
  { name: "node_modules", path: path.join(rootDir, "node_modules"), isDir: true },
];

if (isTotalClean) {
  targets.push({
    name: "package-lock.json",
    path: path.join(rootDir, "package-lock.json"),
    isDir: false,
  });
}

let removedCount = 0;

for (const target of targets) {
  if (!fs.existsSync(target.path)) {
    console.log(`  ${colorYellow}○${colorReset} ${target.name} - Not present (already clean)`);
    continue;
  }

  if (isDryRun) {
    console.log(`  ${colorCyan}▶${colorReset} [DRY-RUN] Would remove ${colorBold}${target.name}${colorReset} (${target.path})`);
    removedCount++;
    continue;
  }

  process.stdout.write(`  ${colorCyan}▶${colorReset} Removing ${colorBold}${target.name}${colorReset}... `);
  try {
    fs.rmSync(target.path, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 500,
    });
    console.log(`${colorGreen}✓ Completely Removed${colorReset}`);
    removedCount++;
  } catch (err) {
    console.log(`${colorRed}✗ Failed${colorReset}`);
    console.error(`    ${colorRed}Error removing ${target.name}:${colorReset}`, err.message);
    if (err.code === "EBUSY" || err.code === "EPERM") {
      console.log(`    ${colorYellow}Note: A running process (e.g. Next.js dev server) may be locking files.${colorReset}`);
      console.log(`    ${colorYellow}Stop the running terminal process and retry.${colorReset}`);
    }
  }
}

console.log("");
if (isTotalClean) {
  console.log(`${colorGreen}${colorBold}✓ Total clean complete!${colorReset} Removed ${removedCount} target(s).`);
  console.log(`  To reinstall dependencies completely fresh, run: ${colorBold}npm install${colorReset}\n`);
} else {
  console.log(`${colorGreen}${colorBold}✓ Clean complete!${colorReset} Removed ${removedCount} target(s).`);
  console.log(`  To reinstall dependencies, run: ${colorBold}npm install${colorReset}\n`);
}
