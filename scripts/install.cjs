#!/usr/bin/env node
"use strict";

/**
 * Postinstall script for @hestia/mcp. Finds the already-installed
 * `@hestia/mcp-<platform>` optionalDependency matching this machine and
 * places its binary at `bin/hestia.exe` (the `.exe` suffix is used on
 * every platform, not just Windows, because npm's Windows cmd-shim
 * generator requires the target to literally be a `.exe`; POSIX ignores
 * the extension so it's harmless elsewhere).
 *
 * Plain Node.js CommonJS on purpose (no Bun-only syntax, no dependencies
 * of its own) — Node is what's guaranteed present regardless of whether
 * the end user separately has Bun installed.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Keep this table's keys/packages in lockstep with scripts/constants.ts by
// hand (this file ships standalone in the published tarball, so it can't
// import that module at runtime) — a parity test in install.spec.ts fails
// CI if the two ever drift apart.
const PLATFORM_PACKAGES = {
  "darwin-x64": { pkg: "@hestia/mcp-darwin-x64", bin: "hestia" },
  "darwin-arm64": { pkg: "@hestia/mcp-darwin-arm64", bin: "hestia" },
  "linux-x64-glibc": { pkg: "@hestia/mcp-linux-x64", bin: "hestia" },
  "linux-x64-musl": { pkg: "@hestia/mcp-linux-x64-musl", bin: "hestia" },
  "linux-arm64-glibc": { pkg: "@hestia/mcp-linux-arm64", bin: "hestia" },
  "linux-arm64-musl": { pkg: "@hestia/mcp-linux-arm64-musl", bin: "hestia" },
  "win32-x64": { pkg: "@hestia/mcp-win32-x64", bin: "hestia.exe" },
  "win32-arm64": { pkg: "@hestia/mcp-win32-arm64", bin: "hestia.exe" },
};

const DEST_BINARY_NAME = "hestia.exe";

/**
 * Detects musl vs glibc on Linux via `process.report.getReport()` instead
 * of spawning `ldd` (which can fail or simply be missing in minimal
 * containers). A glibc runtime report includes `header.glibcVersionRuntime`;
 * its absence on Linux is treated as musl.
 */
const isMusl = () => {
  if (typeof process.report?.getReport !== "function") {
    // No process.report support (very old Node) — assume glibc, the more
    // common case, rather than fail outright.
    return false;
  }
  try {
    const report = process.report.getReport();
    return !report?.header?.glibcVersionRuntime;
  } catch {
    return false;
  }
};

const detectPlatformKey = () => {
  const platform = process.platform;
  const arch = os.arch();
  if (platform === "linux") {
    return `linux-${arch}-${isMusl() ? "musl" : "glibc"}`;
  }
  return `${platform}-${arch}`;
};

const getDestPath = () => path.join(__dirname, "..", "bin", DEST_BINARY_NAME);

/**
 * True only when running against a checkout of the source repo itself
 * (e.g. a contributor's `bun install`), never for a real end-user install:
 * the published tarball's `files` list never includes `src/`, so this
 * can't false-positive for a real consumer install.
 */
const isRunningInsideSourceRepo = () => fs.existsSync(path.join(__dirname, "..", "src", "main.ts"));

/**
 * Places `srcPath` at `destPath`: hardlink first (fast, zero extra disk
 * use), falling back to unlink-then-hardlink, falling back further to a
 * plain copy (handles cross-device links or restrictive permissions).
 */
const placeBinary = (srcPath, destPath) => {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  try {
    fs.linkSync(srcPath, destPath);
  } catch {
    try {
      fs.unlinkSync(destPath);
    } catch {
      // destPath may not exist yet — fine, keep going.
    }
    try {
      fs.linkSync(srcPath, destPath);
    } catch {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  if (process.platform !== "win32") {
    fs.chmodSync(destPath, 0o755);
  }
};

const printUnsupportedPlatformError = (platformKey) => {
  const supported = Object.keys(PLATFORM_PACKAGES).sort().join(", ");
  console.error(
    [
      `hestia: unsupported platform "${platformKey}" (process.platform=${process.platform}, os.arch()=${os.arch()}).`,
      `Supported platforms: ${supported}.`,
      "If you believe this is wrong, please open an issue at https://github.com/eddienubes/hestia/issues.",
    ].join("\n"),
  );
};

const printMissingPackageError = (platformKey, entry) => {
  console.error(
    [
      `hestia: could not find the "${entry.pkg}" package on disk (expected for platform "${platformKey}").`,
      "This usually means it was skipped during install — try reinstalling without",
      '"--ignore-scripts" and without "--no-optional" (or your package manager\'s',
      "equivalent flags), so npm can download the platform-specific binary package.",
    ].join("\n"),
  );
};

const main = () => {
  if (isRunningInsideSourceRepo()) {
    console.log("hestia: running inside the source repo, skipping binary placement.");
    return;
  }

  const platformKey = detectPlatformKey();
  const entry = PLATFORM_PACKAGES[platformKey];

  if (!entry) {
    printUnsupportedPlatformError(platformKey);
    process.exit(1);
    return;
  }

  let resolvedBinaryPath;
  try {
    resolvedBinaryPath = require.resolve(`${entry.pkg}/bin/${entry.bin}`);
  } catch {
    printMissingPackageError(platformKey, entry);
    process.exit(1);
    return;
  }

  const destPath = getDestPath();
  try {
    placeBinary(resolvedBinaryPath, destPath);
  } catch (err) {
    console.error(`hestia: failed to place binary at ${destPath}: ${err.message}`);
    process.exit(1);
    return;
  }
};

if (require.main === module) {
  main();
}

module.exports = {
  PLATFORM_PACKAGES,
  DEST_BINARY_NAME,
  isMusl,
  detectPlatformKey,
  getDestPath,
  isRunningInsideSourceRepo,
};
