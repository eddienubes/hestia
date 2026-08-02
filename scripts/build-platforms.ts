/**
 * Compiles the platform-specific binary for every target in
 * `scripts/constants.ts` (or a filtered subset — see below), using Bun's
 * cross-compilation support. This can all run from a single host/OS (no
 * runner matrix needed).
 *
 * Usage:
 *   bun run scripts/build-platforms.ts                  # build all 8 targets
 *   bun run scripts/build-platforms.ts darwin-arm64      # build just this one
 *   bun run scripts/build-platforms.ts linux-x64 linux-x64-musl
 */

import fs from "node:fs";
import path from "node:path";
import { ENTRYPOINT, PLATFORM_TARGETS, PLATFORMS_DIR } from "./constants.ts";

const buildTarget = async (target: (typeof PLATFORM_TARGETS)[number]): Promise<void> => {
  const outDir = path.join(PLATFORMS_DIR, target.packageSuffix, "bin");
  fs.mkdirSync(outDir, { recursive: true });
  const outfile = path.join(outDir, target.binaryName);

  console.log(`\n[build-platforms] ${target.packageSuffix} (${target.bunTarget}) -> ${outfile}`);

  const result = await Bun.build({
    entrypoints: [ENTRYPOINT],
    format: "esm",
    minify: true,
    bytecode: true,
    sourcemap: "external",
    compile: { target: target.bunTarget, outfile },
  });

  if (!result.success) {
    const messages = result.logs.map((log) => log.message).join("\n");
    throw new Error(`bun build failed for target ${target.packageSuffix}:\n${messages}`);
  }
};

const main = async (): Promise<void> => {
  const requestedSuffixes = process.argv.slice(2);
  const targets =
    requestedSuffixes.length === 0
      ? PLATFORM_TARGETS
      : PLATFORM_TARGETS.filter((t) => requestedSuffixes.includes(t.packageSuffix));

  if (requestedSuffixes.length > 0 && targets.length !== requestedSuffixes.length) {
    const known = new Set(PLATFORM_TARGETS.map((t) => t.packageSuffix));
    const unknown = requestedSuffixes.filter((s) => !known.has(s));
    console.error(`[build-platforms] unknown target(s): ${unknown.join(", ")}`);
    console.error(`[build-platforms] known targets: ${[...known].join(", ")}`);
    process.exit(1);
  }

  for (const target of targets) {
    await buildTarget(target);
  }

  console.log(`\n[build-platforms] built ${targets.length} target(s) successfully.`);
};

await main();
