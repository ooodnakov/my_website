import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";

for (const route of ["/", "/en", "/ru", "/cv/", "/cv/en", "/cv/ru", "/legacy/"]) {
  test(`route renders its app: ${route}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.url().startsWith("http://127.0.0.1:5000/") && response.status() >= 400) {
        errors.push(`${response.status()} ${response.url()}`);
      }
    });
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    if (route.startsWith("/cv/")) {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(route.endsWith("ru") ? "Александр Однаков" : "Aleksandr Odnakov");
      await expect(page.getByRole("heading", { name: route.endsWith("ru") ? "Опыт" : "Experience", exact: true })).toBeVisible();
    } else if (route.startsWith("/legacy/")) {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Aleksandr Odnakov");
      await expect(page.getByRole("link", { name: "Open old archive", exact: true })).toHaveAttribute("href", "/legacy/archive/projects/");
    } else {
      await expect(page.locator(".xterm-screen")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", route === "/ru" ? "ru" : "en");
    }
    expect(errors).toEqual([]);
  });
}

test("legacy files and archive redirect are served", async ({ request }) => {
  for (const route of ["/cv-pdf/en", "/cv-pdf/ru"]) {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
  }
  const vcard = await request.get("/vcard/828869858");
  expect(vcard.status()).toBe(200);
  expect(vcard.headers()["content-type"]).toContain("text/vcard");
  expect(await vcard.text()).toContain("BEGIN:VCARD");
  const archive = await request.get("/legacy/projects", { maxRedirects: 0 });
  expect(archive.status()).toBe(302);
  expect(archive.headers().location).toBe("/legacy/archive/projects/");
  const archivePage = await request.get(archive.headers().location);
  expect(archivePage.status()).toBe(200);
  expect(archivePage.headers()["content-type"]).toContain("text/html");
});

test("Browser OS release assets are all served with manifest hashes", async ({ request }) => {
  test.setTimeout(120_000);
  const release = "/browser-os/alpine-3.24.2-v86-0.5.469";
  const manifestResponse = await request.get(`${release}/manifest.json`);
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();

  const requiredAssets = [
    "alpine/vmlinuz",
    "alpine/initramfs",
    "alpine/9p/fs.json",
    "v86/seabios.bin",
    "v86/vgabios.bin",
    "v86/libv86.mjs",
    "v86/v86.wasm",
    "v86/v86-fallback.wasm",
  ];
  for (const assetPath of requiredAssets) {
    expect(manifest.assets[assetPath], assetPath).toBeDefined();
  }

  for (const [assetPath, expected] of Object.entries(manifest.assets)) {
    const assetResponse = await request.get(`${release}/${assetPath}`);
    expect(assetResponse.status(), assetPath).toBe(200);
    const body = await assetResponse.body();
    expect(body.length, assetPath).toBe(expected.bytes);
    expect(createHash("sha256").update(body).digest("hex"), assetPath).toBe(expected.sha256);
  }
});

test("Browser OS missing assets return JSON 404 and guest assets revalidate", async ({ request }) => {
  const missing = await request.get("/browser-os/alpine-3.24.2-v86-0.5.469/v86/missing.wasm");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-type"]).toContain("application/json");
  expect(await missing.text()).not.toContain("<!doctype html>");

  const manifest = await (await request.get("/browser-os/alpine-3.24.2-v86-0.5.469/manifest.json")).json();
  const release = "/browser-os/alpine-3.24.2-v86-0.5.469";
  const wasm = await request.get(`${release}/${manifest.emulator.assetPaths.wasm}`);
  expect(wasm.status()).toBe(200);
  expect(wasm.headers()["content-type"]).toContain("application/wasm");
  expect(wasm.headers()["cache-control"]).toContain("max-age=0");
  const wasmEtag = wasm.headers()["etag"];
  if (!wasmEtag) throw new Error("Expected a guest asset ETag");
  const revalidatedWasm = await request.get(`${release}/${manifest.emulator.assetPaths.wasm}`, {
    headers: { "If-None-Match": wasmEtag },
  });
  expect(revalidatedWasm.status()).toBe(304);

  expect(wasm.headers()["cache-control"]).toContain("must-revalidate");
  const manifestResponse = await request.get(`${release}/manifest.json`);
  expect(manifestResponse.headers()["cache-control"]).toContain("no-cache");
  const manifestEtag = manifestResponse.headers()["etag"];
  if (!manifestEtag) throw new Error("Expected the manifest ETag");
  const revalidatedManifest = await request.get(`${release}/manifest.json`, {
    headers: { "If-None-Match": manifestEtag },
  });
  expect(revalidatedManifest.status()).toBe(304);
});
