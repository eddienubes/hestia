import path from "node:path";

export const REPO_ROOT = path.join(import.meta.dir, "..");
export const PLATFORMS_DIR = path.join(REPO_ROOT, "platforms");
export const ENTRYPOINT = path.join(REPO_ROOT, "src/main.ts");

export interface PlatformTarget {
  /** Suffix used both for the npm package name and the platforms/<suffix> directory, e.g. "darwin-x64". */
  packageSuffix: string;
  /** Full npm package name, e.g. "@hestia/mcp-darwin-x64". */
  packageName: string;
  /** Value passed to `Bun.build()`'s `compile.target`. */
  bunTarget: Bun.Build.CompileTarget;
  /** Matches Node's `process.platform`. */
  os: "darwin" | "linux" | "win32";
  /** Matches Node's `os.arch()`. */
  cpu: "x64" | "arm64";
  /** Only set for Linux targets; matches Node's libc detection. */
  libc?: "glibc" | "musl";
  /** Filename of the compiled binary inside the platform package's bin/ dir. */
  binaryName: string;
}

export const USERNAME = "eddienubes";
export const NAME = `hestia`;
export const PACKAGE_SCOPE = `@${NAME}`;
export const PACKAGE_BASE_NAME = "mcp";

export const PLATFORM_TARGETS: readonly PlatformTarget[] = [
  {
    packageSuffix: "darwin-x64",
    packageName: `${PACKAGE_SCOPE}/${PACKAGE_BASE_NAME}-darwin-x64`,
    bunTarget: "bun-darwin-x64",
    os: "darwin",
    cpu: "x64",
    binaryName: NAME,
  },
  {
    packageSuffix: "darwin-arm64",
    packageName: `${PACKAGE_SCOPE}/${PACKAGE_BASE_NAME}-darwin-arm64`,
    bunTarget: "bun-darwin-arm64",
    os: "darwin",
    cpu: "arm64",
    binaryName: NAME,
  },
  {
    packageSuffix: "linux-x64",
    packageName: `${PACKAGE_SCOPE}/${PACKAGE_BASE_NAME}-linux-x64`,
    bunTarget: "bun-linux-x64",
    os: "linux",
    cpu: "x64",
    libc: "glibc",
    binaryName: NAME,
  },
  {
    packageSuffix: "linux-x64-musl",
    packageName: `${PACKAGE_SCOPE}/${PACKAGE_BASE_NAME}-linux-x64-musl`,
    bunTarget: "bun-linux-x64-musl",
    os: "linux",
    cpu: "x64",
    libc: "musl",
    binaryName: NAME,
  },
  {
    packageSuffix: "linux-arm64",
    packageName: `${PACKAGE_SCOPE}/${PACKAGE_BASE_NAME}-linux-arm64`,
    bunTarget: "bun-linux-arm64",
    os: "linux",
    cpu: "arm64",
    libc: "glibc",
    binaryName: NAME,
  },
  {
    packageSuffix: "linux-arm64-musl",
    packageName: `${PACKAGE_SCOPE}/${PACKAGE_BASE_NAME}-linux-arm64-musl`,
    bunTarget: "bun-linux-arm64-musl",
    os: "linux",
    cpu: "arm64",
    libc: "musl",
    binaryName: NAME,
  },
  {
    packageSuffix: "win32-x64",
    packageName: `${PACKAGE_SCOPE}/${PACKAGE_BASE_NAME}-win32-x64`,
    bunTarget: "bun-windows-x64",
    os: "win32",
    cpu: "x64",
    binaryName: `${NAME}.exe`,
  },
  {
    packageSuffix: "win32-arm64",
    packageName: `${PACKAGE_SCOPE}/${PACKAGE_BASE_NAME}-win32-arm64`,
    bunTarget: "bun-windows-arm64",
    os: "win32",
    cpu: "arm64",
    binaryName: `${NAME}.exe`,
  },
];

/**
 * The key `install.cjs` uses (independently, in plain CommonJS) to look up
 * the right platform package at postinstall time. Linux entries always
 * carry an explicit glibc/musl suffix; the npm package name itself only
 * adds a "-musl" suffix for the musl variant, which is a distinct string
 * on purpose.
 */
export const getPlatformKey = (target: PlatformTarget): string =>
  target.libc ? `${target.os}-${target.cpu}-${target.libc}` : `${target.os}-${target.cpu}`;
