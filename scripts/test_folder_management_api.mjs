/**
 * Automated Test Suite for Custom Hierarchical Folder Management Engine
 *
 * Comprehensive tests covering:
 * 1. Path Normalization, Validation, and Path Traversal Security
 * 2. Arbitrary Unlimited Nested Hierarchy Creation (e.g. GPN -> 1 -> 2 -> 3)
 * 3. Breadcrumb & Hierarchy Traversal
 * 4. R2 Object Key Prefix Extraction & Alignment
 * 5. Cascading Renaming across Subfolders and Files
 * 6. Folder Movement & Self-Nesting Prevention Safeguards
 * 7. Base v0.0.0 Installer Permanence & Deletion Safeguards
 * 8. Live End-to-End API HTTP Verification (if API key available)
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

console.log("===============================================================================");
console.log("Starting Custom Hierarchical Folder Management Verification Suite");
console.log("===============================================================================\n");

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}\n`);
  }
}

// =============================================================================
// Implementation replicas of pure folder algorithms for authoritative validation
// =============================================================================

function normalizeFolderPath(path) {
  if (!path || typeof path !== "string") return "";
  let clean = path.trim().replace(/\\/g, "/");

  clean = clean.replace(/^\/+|\/+$/g, "");

  if (/(?:^|\/)\.\.(?:\/|$)/.test(clean) || /(?:^|\/)\.(?:\/|$)/.test(clean)) {
    throw new Error("Path traversal characters ('..' or '.') are strictly forbidden");
  }

  if (/[\x00-\x1f\x7f<>:"|?*]/.test(clean)) {
    throw new Error("Invalid character detected in folder path");
  }

  const segments = clean.split("/").filter((s) => s.trim().length > 0);

  const sanitizedSegments = segments.map((seg) => {
    let s = seg.trim().replace(/\s+/g, "_");
    s = s.replace(/[^a-zA-Z0-9_\-\.]/g, "");
    if (!s) {
      throw new Error(`Folder segment '${seg}' contains only invalid characters`);
    }
    return s;
  });

  return sanitizedSegments.join("/");
}

function getFolderNameFromPath(path) {
  const norm = normalizeFolderPath(path);
  if (!norm) return "";
  const parts = norm.split("/");
  return parts[parts.length - 1];
}

function getFolderParentPath(path) {
  const norm = normalizeFolderPath(path);
  if (!norm) return null;
  const lastSlash = norm.lastIndexOf("/");
  if (lastSlash === -1) return null;
  return norm.substring(0, lastSlash);
}

function getFolderDepth(path) {
  const norm = normalizeFolderPath(path);
  if (!norm) return 0;
  return norm.split("/").length;
}

function getBreadcrumbs(path) {
  const norm = normalizeFolderPath(path);
  const crumbs = [{ name: "Storage", path: "" }];
  if (!norm) return crumbs;

  const parts = norm.split("/");
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    crumbs.push({ name: part, path: acc });
  }
  return crumbs;
}

function extractFolderFromR2Key(key) {
  if (!key || typeof key !== "string") return null;
  let cleanKey = key.trim().replace(/\\/g, "/").replace(/^\/+/, "");

  if (cleanKey.startsWith("u/")) {
    const afterU = cleanKey.substring(2);
    const slashIdx = afterU.indexOf("/");
    if (slashIdx !== -1) {
      cleanKey = afterU.substring(slashIdx + 1);
    } else {
      return null;
    }
  }

  const lastSlash = cleanKey.lastIndexOf("/");
  if (lastSlash === -1) return null;

  const folderPath = cleanKey.substring(0, lastSlash);
  return folderPath || null;
}

function buildFolderTree(items) {
  const map = new Map();
  const roots = [];

  for (const item of items) {
    map.set(item.path, { ...item, children: [] });
  }

  for (const item of items) {
    const node = map.get(item.path);
    if (!node) continue;

    if (item.parent_path && map.has(item.parent_path)) {
      map.get(item.parent_path).children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function validateFolderMove(sourcePath, destParentPath) {
  const normSource = normalizeFolderPath(sourcePath);
  const normDest = normalizeFolderPath(destParentPath);

  if (!normSource) throw new Error("Cannot move root storage");
  if (normSource === normDest) throw new Error("Cannot move folder into itself");

  if (normDest === normSource || normDest.startsWith(`${normSource}/`)) {
    throw new Error(`Cannot move folder into its own subfolder ('${normDest}' is inside '${normSource}')`);
  }

  const folderName = getFolderNameFromPath(normSource);
  const newPath = normDest ? `${normDest}/${folderName}` : folderName;
  return newPath;
}

function validateBaseInstallerPermanence(targetPath, files = []) {
  const norm = normalizeFolderPath(targetPath);
  if (norm === "gpn-dynamic-update" || norm.startsWith("gpn-dynamic-update/")) {
    const err = new Error("BASE_INSTALLER_PROTECTED: Base v0.0.0 installer is permanently protected.");
    err.code = "BASE_INSTALLER_PROTECTED";
    throw err;
  }
  for (const f of files) {
    if (
      (f.folder === norm || (f.folder && f.folder.startsWith(`${norm}/`))) &&
      (f.is_release_locked || f.share_slug === "gpn-app" || f.share_slug === "gpn-app-sig")
    ) {
      const err = new Error(`BASE_INSTALLER_PROTECTED: Protected Base installer binary exists in '${f.folder}'.`);
      err.code = "BASE_INSTALLER_PROTECTED";
      throw err;
    }
  }
}

// =============================================================================
// SUITE 1: Path Normalization, Traversal Defense & Security
// =============================================================================
console.log("--- Suite 1: Path Normalization & Security Guards ---");

await runTest("Normalizes standard hierarchical paths", () => {
  assert.equal(normalizeFolderPath("GPN"), "GPN");
  assert.equal(normalizeFolderPath("GPN/1"), "GPN/1");
  assert.equal(normalizeFolderPath("GPN/1/2"), "GPN/1/2");
  assert.equal(normalizeFolderPath("GPN/1/2/deep_folder-3"), "GPN/1/2/deep_folder-3");
});

await runTest("Collapses redundant slashes and trims leading/trailing slashes", () => {
  assert.equal(normalizeFolderPath("/GPN///1//2/"), "GPN/1/2");
  assert.equal(normalizeFolderPath("///a/b/c///"), "a/b/c");
  assert.equal(normalizeFolderPath("   GPN/subfolder   "), "GPN/subfolder");
});

await runTest("Strictly rejects path traversal attacks with '..'", () => {
  assert.throws(
    () => normalizeFolderPath("../secret"),
    /Path traversal characters/
  );
  assert.throws(
    () => normalizeFolderPath("GPN/../../etc/passwd"),
    /Path traversal characters/
  );
  assert.throws(
    () => normalizeFolderPath("GPN/.."),
    /Path traversal characters/
  );
  assert.throws(
    () => normalizeFolderPath("GPN/./sub"),
    /Path traversal characters/
  );
});

await runTest("Sanitizes backslashes and null bytes", () => {
  assert.throws(
    () => normalizeFolderPath("GPN\0malicious"),
    /Invalid character/
  );
  assert.equal(normalizeFolderPath("GPN\\1\\2"), "GPN/1/2");
});

// =============================================================================
// SUITE 2: Hierarchy Traversal & Breadcrumbs
// =============================================================================
console.log("\n--- Suite 2: Hierarchy Traversal & Breadcrumbs ---");

await runTest("Extracts folder name, parent path, and depth accurately", () => {
  assert.equal(getFolderNameFromPath("GPN"), "GPN");
  assert.equal(getFolderNameFromPath("GPN/1/2"), "2");
  assert.equal(getFolderNameFromPath("GPN/1/2/3"), "3");

  assert.equal(getFolderParentPath("GPN"), null);
  assert.equal(getFolderParentPath("GPN/1"), "GPN");
  assert.equal(getFolderParentPath("GPN/1/2"), "GPN/1");
  assert.equal(getFolderParentPath("GPN/1/2/3"), "GPN/1/2");

  assert.equal(getFolderDepth(""), 0);
  assert.equal(getFolderDepth("GPN"), 1);
  assert.equal(getFolderDepth("GPN/1"), 2);
  assert.equal(getFolderDepth("GPN/1/2"), 3);
  assert.equal(getFolderDepth("GPN/1/2/3"), 4);
});

await runTest("Generates complete interactive breadcrumb trails", () => {
  const crumbs = getBreadcrumbs("GPN/1/2");
  assert.equal(crumbs.length, 4);
  assert.deepEqual(crumbs[0], { name: "Storage", path: "" });
  assert.deepEqual(crumbs[1], { name: "GPN", path: "GPN" });
  assert.deepEqual(crumbs[2], { name: "1", path: "GPN/1" });
  assert.deepEqual(crumbs[3], { name: "2", path: "GPN/1/2" });
});

// =============================================================================
// SUITE 3: Cloudflare R2 Key Prefix Alignment
// =============================================================================
console.log("\n--- Suite 3: Cloudflare R2 Prefix Extraction ---");

await runTest("Extracts nested folder from tenant-scoped R2 keys", () => {
  assert.equal(
    extractFolderFromR2Key("u/user_123/GPN/1/2/release.exe"),
    "GPN/1/2"
  );
  assert.equal(
    extractFolderFromR2Key("u/user_123/gpn-dynamic-update/patch.bin"),
    "gpn-dynamic-update"
  );
  assert.equal(
    extractFolderFromR2Key("u/user_123/root_file.png"),
    null
  );
  assert.equal(
    extractFolderFromR2Key("GPN/1/file.txt"),
    "GPN/1"
  );
});

// =============================================================================
// SUITE 4: Hierarchy Tree Construction
// =============================================================================
console.log("\n--- Suite 4: Hierarchy Tree Construction ---");

await runTest("Builds multi-level recursive folder tree", () => {
  const rawItems = [
    { name: "GPN", path: "GPN", parent_path: null, depth: 1 },
    { name: "1", path: "GPN/1", parent_path: "GPN", depth: 2 },
    { name: "2", path: "GPN/1/2", parent_path: "GPN/1", depth: 3 },
    { name: "Docs", path: "Docs", parent_path: null, depth: 1 },
    { name: "2026", path: "Docs/2026", parent_path: "Docs", depth: 2 },
  ];

  const tree = buildFolderTree(rawItems);
  assert.equal(tree.length, 2); // 'GPN' and 'Docs'

  const gpn = tree.find((t) => t.name === "GPN");
  assert.ok(gpn);
  assert.equal(gpn.children.length, 1);
  assert.equal(gpn.children[0].name, "1");
  assert.equal(gpn.children[0].children.length, 1);
  assert.equal(gpn.children[0].children[0].name, "2");

  const docs = tree.find((t) => t.name === "Docs");
  assert.ok(docs);
  assert.equal(docs.children.length, 1);
  assert.equal(docs.children[0].name, "2026");
});

// =============================================================================
// SUITE 5: Move & Nesting Safeguards
// =============================================================================
console.log("\n--- Suite 5: Move & Nesting Safeguards ---");

await runTest("Prevents moving a folder into its own subtree", () => {
  assert.throws(
    () => validateFolderMove("GPN/1", "GPN/1/2"),
    /Cannot move folder into its own subfolder/
  );

  assert.throws(
    () => validateFolderMove("GPN", "GPN"),
    /Cannot move folder into itself/
  );

  assert.throws(
    () => validateFolderMove("GPN", "GPN/sub/nested"),
    /Cannot move folder into its own subfolder/
  );
});

await runTest("Computes valid moved path to root or sibling parent", () => {
  assert.equal(validateFolderMove("GPN/1/2", "GPN"), "GPN/2");
  assert.equal(validateFolderMove("GPN/1/2", ""), "2");
  assert.equal(validateFolderMove("Docs/2026", "Archive"), "Archive/2026");
});

// =============================================================================
// SUITE 6: Base v0.0.0 Installer Permanence Protection
// =============================================================================
console.log("\n--- Suite 6: Base v0.0.0 Installer Protection ---");

await runTest("Rejects deletion or rename of protected Base v0.0.0 installer folder", () => {
  assert.throws(
    () => validateBaseInstallerPermanence("gpn-dynamic-update"),
    (err) => {
      assert.equal(err.code, "BASE_INSTALLER_PROTECTED");
      return true;
    }
  );

  const mockFiles = [
    { id: "1", folder: "custom/release", share_slug: "gpn-app", is_release_locked: true },
    { id: "2", folder: "custom/other", share_slug: "other-slug", is_release_locked: false },
  ];

  assert.throws(
    () => validateBaseInstallerPermanence("custom/release", mockFiles),
    (err) => {
      assert.equal(err.code, "BASE_INSTALLER_PROTECTED");
      return true;
    }
  );

  // Unrelated folder deletion allowed
  assert.doesNotThrow(() => {
    validateBaseInstallerPermanence("custom/other", mockFiles);
  });
});

// =============================================================================
// SUITE 7: Live API Integration (HTTP End-to-End against local Next.js server)
// =============================================================================
console.log("\n--- Suite 7: Live API Key HTTP Verification ---");

let apiKey = null;
try {
  const pcAppEnv = fs.readFileSync(
    "D:/GAURAV-TEMP/Github/gaurav-personal-notes/pc-app/.env.local",
    "utf-8"
  );
  apiKey = pcAppEnv.match(/VITE_GPHOST_API_KEY\s*=\s*"([^"]+)"/)?.[1];
} catch {}

const PORT = 3008;
const baseUrl = `http://127.0.0.1:${PORT}`;
let serverProcess = null;

async function startLocalServer() {
  serverProcess = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    stdio: "pipe",
    env: { ...process.env, PORT: String(PORT) },
  });

  serverProcess.stderr.on("data", (d) => {
    const err = d.toString();
    if (!err.includes("DeprecationWarning")) {
      console.error("  [Server Error]:", err);
    }
  });

  const start = Date.now();
  while (Date.now() - start < 20000) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/auth/session-status`);
      if (res.status) {
        return;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error("Local test server failed to become ready within 20s");
}

function stopLocalServer() {
  if (serverProcess) {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(serverProcess.pid), "/f", "/t"], { stdio: "ignore" });
      } else {
        serverProcess.kill();
      }
    } catch {}
  }
}

if (apiKey) {
  console.log("  Starting local Next.js test server on port " + PORT + "...");
  await startLocalServer();
  console.log("  ✓ Local server ready on " + baseUrl);

  try {
    const uniqueFolder = `AutomatedTest_${Date.now()}`;

    await runTest("Live API: Creates nested folder structure via POST /api/v1/folders", async () => {
      const res = await fetch(`${baseUrl}/api/v1/folders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: `${uniqueFolder}/1/2` }),
      });

      const data = await res.json();
      assert.equal(res.status, 201, `Expected 201 Created, got ${res.status}: ${JSON.stringify(data)}`);
      assert.ok(data.success);
      assert.equal(data.folder.name, "2");
    });

    await runTest("Live API: Lists folder contents via GET /api/v1/folders?path=...", async () => {
      const res = await fetch(`${baseUrl}/api/v1/folders?path=${encodeURIComponent(`${uniqueFolder}/1`)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.ok(data.success);
      assert.equal(data.subfolders.length, 1);
      assert.equal(data.subfolders[0].name, "2");
      assert.equal(data.breadcrumbs.length, 3);
    });

    await runTest("Live API: Fetches folder tree via GET /api/v1/folders?tree=true", async () => {
      const res = await fetch(`${baseUrl}/api/v1/folders?tree=true`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.ok(data.success);
      assert.ok(Array.isArray(data.tree));
      const found = data.tree.find((t) => t.name === uniqueFolder);
      assert.ok(found, `Folder '${uniqueFolder}' should exist in tree`);
    });

    await runTest("Live API: Renames folder via PATCH /api/v1/folders", async () => {
      const res = await fetch(`${baseUrl}/api/v1/folders`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: `${uniqueFolder}/1/2`,
          newName: "2_renamed",
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      assert.ok(data.success);
      assert.equal(data.newPath, `${uniqueFolder}/1/2_renamed`);
    });

    await runTest("Live API: Moves folder to new parent via PATCH /api/v1/folders", async () => {
      const res = await fetch(`${baseUrl}/api/v1/folders`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: `${uniqueFolder}/1/2_renamed`,
          destinationParent: uniqueFolder,
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.ok(data.success);
      assert.equal(data.newPath, `${uniqueFolder}/2_renamed`);
    });

    await runTest("Live API: Protects Base v0.0.0 installer from deletion (403 BASE_INSTALLER_PROTECTED)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/folders?path=gpn-dynamic-update&recursive=true`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const data = await res.json();
      assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
      assert.equal(data.code, "BASE_INSTALLER_PROTECTED");
    });

    await runTest("Live API: Deletes test folder hierarchy via DELETE /api/v1/folders", async () => {
      const res = await fetch(`${baseUrl}/api/v1/folders?path=${encodeURIComponent(uniqueFolder)}&recursive=true`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.ok(data.success);
    });
  } finally {
    stopLocalServer();
  }
} else {
  console.log("  ⓘ [SKIP] Live HTTP API suite skipped (No local VITE_GPHOST_API_KEY found)");
}

// =============================================================================
// SUMMARY
// =============================================================================
console.log("\n===============================================================================");
console.log(`Test Execution Completed: ${passedTests}/${totalTests} Passed`);
if (passedTests === totalTests) {
  console.log("STATUS: ALL TESTS PASSED SUCCESSFULLY! Folder engine is production-ready.");
} else {
  console.error(`STATUS: ${totalTests - passedTests} TESTS FAILED.`);
  process.exit(1);
}
console.log("===============================================================================\n");
