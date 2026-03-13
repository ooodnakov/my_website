import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { cp, readFile, rm, stat } from "fs/promises";
import { execFileSync } from "child_process";
import path from "path";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const repoRoot = path.resolve(projectRoot, "..", "..");
  const cvRoot = path.resolve(repoRoot, "apps", "cv-site");
  const legacyRoot = path.resolve(repoRoot, "apps", "legacy-links-site");

  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  await stat(path.join(cvRoot, "package.json")).catch(() => {
    throw new Error(
      `Could not find the CV project at ${cvRoot}. Expected it inside apps/cv-site.`,
    );
  });

  console.log("building cv...");
  execFileSync("npm", ["run", "build", "--", "--base=/cv/", "--outDir=dist"], {
    cwd: cvRoot,
    stdio: "inherit",
    env: process.env,
  });
  await cp(
    path.join(cvRoot, "dist"),
    path.join(projectRoot, "dist", "public", "cv"),
    { recursive: true },
  );

  await stat(path.join(legacyRoot, "package.json")).catch(() => {
    throw new Error(
      `Could not find the legacy Vite project at ${legacyRoot}. Expected it inside apps/legacy-links-site.`,
    );
  });

  console.log("building legacy...");
  execFileSync("npm", ["run", "build"], {
    cwd: legacyRoot,
    stdio: "inherit",
    env: process.env,
  });
  await cp(
    path.join(legacyRoot, "dist"),
    path.join(projectRoot, "dist", "public", "legacy"),
    { recursive: true },
  );

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
