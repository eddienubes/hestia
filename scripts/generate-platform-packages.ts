/**
 * Generates the 8 minimal `platforms/<suffix>/package.json` manifests from
 * `scripts/constants.ts`, pinning their version to the main package's
 * current `version`. Run this before `build-platforms.ts` and before
 * publishing the platform packages.
 */

import fs from "node:fs";
import path from "node:path";
import rootPkg from "../package.json" with { type: "json" };
import { NAME, PLATFORM_TARGETS, PLATFORMS_DIR, USERNAME } from "./constants.ts";

const main = (): void => {
  for (const target of PLATFORM_TARGETS) {
    const dir = path.join(PLATFORMS_DIR, target.packageSuffix);
    fs.mkdirSync(path.join(dir, "bin"), { recursive: true });

    const manifest = {
      name: target.packageName,
      version: rootPkg.version,
      description: `Precompiled hestia MCP server binary for ${target.os}/${target.cpu}${
        target.libc ? ` (${target.libc})` : ""
      }.`,
      license: rootPkg.license,
      os: [target.os],
      cpu: [target.cpu],
      ...(target.libc ? { libc: [target.libc] } : {}),
      files: ["bin"],
      repository: {
        type: "git",
        url: `git+https://github.com/${USERNAME}/${NAME}.git`,
      },
    };

    fs.writeFileSync(path.join(dir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`generated platforms/${target.packageSuffix}/package.json (v${rootPkg.version})`);
  }
};

main();
