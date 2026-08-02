import { createRequire } from "node:module";
import { describe, expect, it } from "bun:test";
import { getPlatformKey, PLATFORM_TARGETS } from "./constants.ts";

// install.cjs ships standalone in the published tarball (no imports beyond
// Node builtins), so it can't import scripts/constants.ts at runtime. We
// require it here the same way Node's own postinstall would, via a real
// CommonJS require rather than a Bun-specific import, to keep the test
// honest about how the file is actually consumed.
const require = createRequire(import.meta.url);
const install = require("./install.cjs") as {
  PLATFORM_PACKAGES: Record<string, { pkg: string; bin: string }>;
  DEST_BINARY_NAME: string;
  isMusl: () => boolean;
  detectPlatformKey: () => string;
  getDestPath: () => string;
  isRunningInsideSourceRepo: () => boolean;
};

describe("install.cjs platform detection", () => {
  it("should detect the current machine's platform key without throwing", () => {
    const key = install.detectPlatformKey();
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  it("should append -glibc or -musl only for linux, never for darwin/win32", () => {
    const key = install.detectPlatformKey();
    if (process.platform === "linux") {
      expect(key).toMatch(/^linux-(x64|arm64)-(glibc|musl)$/);
    } else {
      expect(key).toBe(`${process.platform}-${require("node:os").arch()}`);
    }
  });

  it("should resolve the current machine's detected key to a known platform package", () => {
    const key = install.detectPlatformKey();
    expect(install.PLATFORM_PACKAGES).toHaveProperty(key);
  });

  it("should return a boolean from isMusl() without throwing, even off-Linux", () => {
    expect(typeof install.isMusl()).toBe("boolean");
  });

  it("should always point the destination at bin/hestia.exe", () => {
    expect(install.DEST_BINARY_NAME).toBe("hestia.exe");
    expect(install.getDestPath().endsWith(`bin${require("node:path").sep}hestia.exe`)).toBe(true);
  });

  it("should detect that this repo checkout is the source repo, not an installed package", () => {
    // A real published install never ships src/ (see `files` in
    // package.json), so this can only be true in the source repo itself.
    expect(install.isRunningInsideSourceRepo()).toBe(true);
  });
});

describe("install.cjs / scripts/constants.ts parity", () => {
  it("should list exactly the same set of platform keys as scripts/constants.ts", () => {
    const fromInstall = Object.keys(install.PLATFORM_PACKAGES).sort();
    const fromPlatforms = PLATFORM_TARGETS.map((t) => getPlatformKey(t)).sort();
    expect(fromInstall).toEqual(fromPlatforms);
  });

  it("should map each platform key to the same package name and binary name in both files", () => {
    for (const target of PLATFORM_TARGETS) {
      const key = getPlatformKey(target);
      const entry = install.PLATFORM_PACKAGES[key];
      expect(entry).toBeDefined();
      expect(entry?.pkg).toBe(target.packageName);
      expect(entry?.bin).toBe(target.binaryName);
    }
  });
});
