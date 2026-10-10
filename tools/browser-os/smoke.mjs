import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { runGuestSmoke } from "./smoke-core.mjs";
import { pipeTrackedResponse } from "./smoke-http.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const protocolCodecPath = process.env.BROWSER_OS_COM2_CODEC
  ? path.resolve(process.env.BROWSER_OS_COM2_CODEC)
  : null;
const protocolCodec = protocolCodecPath === null
  ? null
  : await import(pathToFileURL(protocolCodecPath).href);
const protocolCodecSha256 = protocolCodecPath === null
  ? null
  : createHash("sha256").update(await fs.readFile(protocolCodecPath)).digest("hex");
const defaultAssets = path.resolve(here, "../../apps/main/client/public/browser-os/alpine-3.24.2-v86-0.5.469");
const args = process.argv.slice(2);
const assetArgument = args.find(argument => !argument.startsWith("--"));
const assetRoot = path.resolve(assetArgument ?? defaultAssets);
const manifest = JSON.parse(await fs.readFile(path.join(assetRoot, "manifest.json"), "utf8"));
if (manifest.guest?.buildIdentityPath !== "alpine/guest-build.json" ||
    !/^[a-f0-9]{64}$/.test(manifest.guest?.buildId ?? "") ||
    manifest.assets?.[manifest.guest.buildIdentityPath]?.sha256 !== manifest.guest.buildId) {
  throw new Error("manifest guest build identity does not match its descriptor asset");
}

async function verifyAssets() {
  let runtimeBytes = 0;
  for (const [relative, expected] of Object.entries(manifest.assets)) {
    const filename = path.resolve(assetRoot, relative);
    if (!filename.startsWith(`${assetRoot}${path.sep}`)) throw new Error(`unsafe asset path in manifest: ${relative}`);
    const contents = await fs.readFile(filename);
    const sha256 = createHash("sha256").update(contents).digest("hex");
    if (sha256 !== expected.sha256 || contents.length !== expected.bytes) {
      throw new Error(`asset hash/size mismatch: ${relative}`);
    }
    if ((relative.startsWith("v86/") || relative.startsWith("alpine/")) && relative !== "alpine/packages.lock") {
      runtimeBytes += contents.length;
    }
  }
  if (runtimeBytes !== manifest.transfer.uncompressedBytes) {
    throw new Error(`manifest transfer size mismatch: ${runtimeBytes} != ${manifest.transfer.uncompressedBytes}`);
  }
  return runtimeBytes;
}

const manifestRuntimeBytes = await verifyAssets();
const v86Assets = manifest.emulator.assetPaths;
const guestAssets = manifest.guest.assetPaths;
const memoryBytes = manifest.guest.memoryBytes;
const cmdline = manifest.guest.kernelCommandLine;

async function toArrayBuffer(filename) {
  const data = await fs.readFile(filename);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

const nodeAssets = {
  wasm_path: path.join(assetRoot, v86Assets.wasm),
  bios: { buffer: await toArrayBuffer(path.join(assetRoot, v86Assets.bios)) },
  vga_bios: { buffer: await toArrayBuffer(path.join(assetRoot, v86Assets.vgaBios)) },
  bzimage: { buffer: await toArrayBuffer(path.join(assetRoot, guestAssets.kernel)) },
  initrd: { buffer: await toArrayBuffer(path.join(assetRoot, guestAssets.initrd)) },
  filesystem: {
    basefs: path.join(assetRoot, guestAssets.filesystemJson),
    baseurl: `${assetRoot}/${guestAssets.filesystemBlobs}`,
  },
};

function baseOptions(assets) {
  return {
    ...assets,
    memory_size: memoryBytes,
    cmdline,
    uart1: true,
    autostart: true,
    fastboot: true,
    disable_mouse: true,
    disable_speaker: true,
    log_level: 0,
  };
}

async function runNode() {
  const { V86 } = await import("v86");
  const bootStartedAt = Date.now();
  const emulator = new V86(baseOptions(nodeAssets));
  try {
    const result = await runGuestSmoke(emulator, bootStartedAt, undefined, undefined, manifest.guest.buildId, protocolCodec);
    return { ...result, localAssetBytes: manifestRuntimeBytes };
  } finally {
    await emulator.destroy().catch(() => {});
  }
}

function mimeType(filename) {
  if (filename.endsWith(".wasm")) return "application/wasm";
  if (filename.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (filename.endsWith(".json")) return "application/json; charset=utf-8";
  if (filename.endsWith(".zst")) return "application/zstd";
  return "application/octet-stream";
}

async function runBrowser() {
  const corePath = path.join(here, "smoke-core.mjs");
  const requests = [];
  const failures = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname === "/__test/") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end("<!doctype html><meta charset=utf-8><title>Guest smoke</title>");
        return;
      }
      if (url.pathname === "/__test/smoke-core.mjs") {
        const stats = await fs.stat(corePath);
        const trackedRequest = { path: url.pathname, bytes: 0 };
        requests.push(trackedRequest);
        response.writeHead(200, {
          "content-type": "text/javascript; charset=utf-8",
          "content-length": stats.size,
          "cache-control": "no-store",
        });
        pipeTrackedResponse(createReadStream(corePath), response, trackedRequest);
        return;
      }
      if (url.pathname === "/favicon.ico") {
        response.writeHead(204).end();
        return;
      }
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const filename = path.resolve(assetRoot, relative);
      if (!filename.startsWith(`${assetRoot}${path.sep}`)) {
        response.writeHead(400).end("bad path");
        return;
      }
      const stats = await fs.stat(filename);
      if (!stats.isFile()) {
        response.writeHead(404).end("not found");
        return;
      }
      const etag = `W/"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs / 1000).toString(16)}"`;
      const cacheHeaders = {
        "cache-control": "public, max-age=0",
        etag,
        "last-modified": stats.mtime.toUTCString(),
        "x-content-type-options": "nosniff",
      };
      const ifNoneMatch = request.headers["if-none-match"];
      if (typeof ifNoneMatch === "string" && (ifNoneMatch === "*" || ifNoneMatch.split(",").map(value => value.trim()).includes(etag))) {
        requests.push({ path: `/${relative}`, bytes: 0, status: 304 });
        response.writeHead(304, cacheHeaders).end();
        return;
      }
      const trackedRequest = { path: `/${relative}`, bytes: 0, status: 200 };
      requests.push(trackedRequest);
      response.writeHead(200, {
        ...cacheHeaders,
        "content-type": mimeType(filename),
        "content-length": stats.size,
      });
      pipeTrackedResponse(createReadStream(filename), response, trackedRequest);
    } catch {
      failures.push(request.url ?? "unknown request");
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/snap/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(`${origin}/__test/`, { waitUntil: "domcontentloaded" });
    let guestAssetHttpBytesAtShellReady = null;
    let guestAssetRequestsAtShellReady = null;
    await page.exposeFunction("__recordShellReady", () => {
      const guestAssetRequests = requests.filter(item => !item.path.startsWith("/__test/"));
      guestAssetHttpBytesAtShellReady = guestAssetRequests.reduce((total, item) => total + item.bytes, 0);
      guestAssetRequestsAtShellReady = guestAssetRequests.length;
    });
    const bootStartedAt = Date.now();
    const result = await page.evaluate(async ({ config, startedAt }) => {
      const { V86 } = await import("/v86/libv86.mjs");
      const { runGuestSmoke } = await import("/__test/smoke-core.mjs");
      const emulator = new V86({
        wasm_path: `/${config.emulator.assetPaths.wasm}`,
        bios: { url: `/${config.emulator.assetPaths.bios}` },
        vga_bios: { url: `/${config.emulator.assetPaths.vgaBios}` },
        bzimage: { url: `/${config.guest.assetPaths.kernel}` },
        initrd: { url: `/${config.guest.assetPaths.initrd}` },
        filesystem: {
          basefs: `/${config.guest.assetPaths.filesystemJson}`,
          baseurl: `/${config.guest.assetPaths.filesystemBlobs}`,
        },
        memory_size: config.guest.memoryBytes,
        cmdline: config.guest.kernelCommandLine,
        uart1: true,
        autostart: true,
        fastboot: true,
        disable_mouse: true,
        disable_speaker: true,
        log_level: 0,
      });
      try {
        return await runGuestSmoke(emulator, startedAt, undefined, () => window.__recordShellReady(), config.guest.buildId);
      } finally {
        await emulator.destroy().catch(() => {});
      }
    }, { config: manifest, startedAt: bootStartedAt });
    if (pageErrors.length) throw new Error(`Chromium page errors: ${pageErrors.join("; ")}`);
    if (failures.length) throw new Error(`HTTP asset failures: ${failures.join(", ")}`);
    const guestAssetRequests = requests.filter(item => !item.path.startsWith("/__test/"));
    if (guestAssetHttpBytesAtShellReady === null) throw new Error("shell-ready transfer measurement was not captured");
    return {
      ...result,
      transfer: {
        actualHttpBytes: requests.reduce((total, item) => total + item.bytes, 0),
        guestAssetHttpBytes: guestAssetRequests.reduce((total, item) => total + item.bytes, 0),
        guestAssetHttpBytesAtShellReady,
        guestAssetRequestsAtShellReady,
        uniqueRequestedAssets: new Set(guestAssetRequests.map(item => item.path)).size,
        requests,
        cachedGuestAssetResponses: guestAssetRequests.filter(item => item.status === 304).length,
      },
    };
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

const modes = args.filter(argument => argument.startsWith("--"));
const runNodeMode = modes.length === 0 || modes.includes("--node");
const runBrowserMode = modes.length === 0 || modes.includes("--browser");
const report = {
  release: manifest.release,
  guestRelease: manifest.guest.release,
  kernelRelease: manifest.guest.kernelRelease,
  v86: `${manifest.emulator.version}+${manifest.emulator.sourceCommit.slice(0, 7)}`,
  configuredRamBytes: memoryBytes,
  transferBytesFromManifest: manifestRuntimeBytes,
  node: runNodeMode ? await runNode() : undefined,
  browser: runBrowserMode ? await runBrowser() : undefined,
  websiteCodec: protocolCodecPath === null ? null : {
    path: path.basename(protocolCodecPath),
    sha256: protocolCodecSha256,
    usedBy: runNodeMode ? "node" : "not-used",
  },
};
console.log(JSON.stringify(report, null, 2));
