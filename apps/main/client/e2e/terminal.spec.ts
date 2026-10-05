import { expect, test, type Locator, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

type LinkCaptureField = "openedTerminalUrl" | "openedTerminalLink";

async function clickExpectedTerminalLink(
  page: Page,
  row: Locator,
  field: LinkCaptureField,
  isExpected: (value: string | string[] | undefined) => boolean,
) {
  const screenBounds = await page.locator(".xterm-screen").boundingBox();
  if (!screenBounds) throw new Error("The terminal screen has no browser bounds");
  const rowBounds = await row.boundingBox();
  if (!rowBounds) throw new Error("The terminal link row has no browser bounds");
  const cellWidth = await page.locator(".xterm-char-measure-element").first().evaluate((element) => element.getBoundingClientRect().width / 32);
  if (!Number.isFinite(cellWidth)) throw new Error("The terminal cell width is unavailable");
  const step = Math.max(cellWidth / 2, 1);
  const y = rowBounds.y + rowBounds.height / 2;
  const pointerCursor = page.locator(".xterm-cursor-pointer");

  const attempted: string[] = [];
  for (let x = screenBounds.x + step / 2; x < screenBounds.x + screenBounds.width; x += step) {
    await page.mouse.move(x, y);
    if (await pointerCursor.count() === 0) continue;
    await page.mouse.click(x, y);
    const opened = await page.evaluate((key) => {
      const testWindow = window as Window & { openedTerminalUrl?: string; openedTerminalLink?: string[] };
      return testWindow[key];
    }, field);
    if (opened !== undefined) attempted.push(JSON.stringify(opened));
    if (isExpected(opened)) return;
    await page.evaluate((key) => {
      const testWindow = window as Window & { openedTerminalUrl?: string; openedTerminalLink?: string[] };
      testWindow[key] = undefined;
    }, field);
  }
  throw new Error(`No link in the terminal row matched ${field}; captures: ${attempted.join(", ") || "none"}`);
}

test("shortcut strip and command palette expose primary navigation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("shortcuts")).toBeVisible();
  await expect(page.getByRole("link", { name: "[CV]" })).toBeVisible();

  await page.getByRole("button", { name: /open command palette/i }).click();
  const palette = page.getByRole("dialog", { name: /command palette/i });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("button", { name: /run tour in terminal/i })).toBeVisible();
  await expect(palette.getByRole("button", { name: /run open cv\.txt in terminal/i })).toBeVisible();
  await expect(palette.getByRole("button", { name: /run copy-contact in terminal/i })).toBeVisible();

  await palette.getByRole("button", { name: /run tour in terminal/i }).click();
  await expect(palette).toBeHidden();
  await expect(page.locator(".xterm-screen")).toContainText("Tour");
  await expect(page.locator(".xterm-screen")).toContainText("Oh My Zsh");
});

test("guided visitor actions run terminal commands", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /run projects in terminal/i }).click();
  await expect(page.locator(".xterm-screen")).toContainText("lemma.txt");
  await expect(page.locator(".xterm-screen")).toContainText("open lemma.txt");
});

test("palette remains open and reports busy while an accepted command is pending", async ({ page }) => {
  await page.addInitScript(() => {
    type ClipboardWindow = Window & {
      __clipboardStarted?: boolean;
      __resolveClipboardWrite?: () => void;
    };
    const testWindow = window as ClipboardWindow;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => new Promise<void>((resolve) => {
          testWindow.__clipboardStarted = true;
          testWindow.__resolveClipboardWrite = resolve;
        }),
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /open command palette/i }).click();
  const palette = page.getByRole("dialog", { name: /command palette/i });
  await palette.getByRole("button", { name: /run copy-contact in terminal/i }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __clipboardStarted?: boolean }).__clipboardStarted)).toBe(true);
  await expect(palette).toBeHidden();

  await page.getByRole("button", { name: /open command palette/i }).click();
  await page.getByRole("dialog", { name: /command palette/i }).getByRole("button", { name: /run tour in terminal/i }).click();
  await expect(palette).toBeVisible();
  await expect(page.getByText("Terminal is busy. Please wait.", { exact: true })).toBeVisible();

  await page.evaluate(() => (window as Window & { __resolveClipboardWrite?: () => void }).__resolveClipboardWrite?.());
  await expect(page.locator(".xterm-screen")).toContainText("Copied contact to clipboard");
});

test("session updates visitor content after an in-app locale transition", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator(".xterm-screen")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.evaluate(() => {
    history.pushState({}, "", "/ru");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL(/\/ru$/);
  await page.getByRole("button", { name: "Запустить tour в терминале" }).click();
  await expect(page.locator(".xterm-screen")).toContainText("Тур");
});

test("localized metadata updates for routed home pages", async ({ page }) => {
  await page.goto("/ru");

  await expect(page).toHaveTitle(/Терминальное портфолио/);
  await expect(page.locator('html')).toHaveAttribute("lang", "ru");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Терминальный хаб/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://dnakov.ooo/ru");
  const personJsonLd = await page.locator("#person-jsonld").evaluate((element) => element.textContent ?? "");
  expect(personJsonLd).toContain("ooodnakov");
});

test("copy-contact exposes the primary email", async ({ page }) => {
  await page.goto("/");

  const terminal = page.locator(".xterm-helper-textarea");
  await terminal.click();
  await page.keyboard.type("copy-contact");
  await page.keyboard.press("Enter");

  await expect(page.locator(".xterm-screen")).toContainText("ooodnakov@yandex.ru");
});
test("terminal remount releases viewport listeners and stale resize handlers", async ({ page }) => {
  await page.addInitScript(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    type ResizeWindow = Window & {
      __terminalResizeLifecycle?: {
        activeCount(): number;
        frameCount(): number;
        fireLastHandler(): void;
      };
    };
    const activeListeners = new Set<EventListenerOrEventListenerObject>();
    const allListeners: EventListenerOrEventListenerObject[] = [];
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (this === viewport && type === "resize" && listener) {
        activeListeners.add(listener);
        allListeners.push(listener);
      }
      add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      if (this === viewport && type === "resize" && listener) activeListeners.delete(listener);
      remove.call(this, type, listener, options);
    };
    let frameCount = 0;
    const requestFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      frameCount += 1;
      return requestFrame(callback);
    };
    (window as ResizeWindow).__terminalResizeLifecycle = {
      activeCount: () => activeListeners.size,
      frameCount: () => frameCount,
      fireLastHandler: () => {
        const listener = allListeners.at(-1);
        if (typeof listener === "function") listener.call(viewport, new Event("resize"));
        else listener?.handleEvent(new Event("resize"));
      },
    };
  });
  const resizeSnapshot = () => page.evaluate(() => {
    const lifecycle = (window as Window & {
      __terminalResizeLifecycle: { activeCount(): number; frameCount(): number };
    }).__terminalResizeLifecycle;
    return { activeCount: lifecycle.activeCount(), frameCount: lifecycle.frameCount() };
  });
  const setRoute = (path: string) => page.evaluate((route) => {
    history.pushState({}, "", route);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);

  await page.goto("/");
  await expect.poll(async () => (await resizeSnapshot()).activeCount).toBe(1);
  await setRoute("/__terminal-away");
  await expect(page.getByText("404 Page Not Found")).toBeVisible();
  await expect.poll(async () => (await resizeSnapshot()).activeCount).toBe(0);
  const framesBeforeStaleEvent = (await resizeSnapshot()).frameCount;
  await page.evaluate(() => {
    (window as Window & {
      __terminalResizeLifecycle: { fireLastHandler(): void };
    }).__terminalResizeLifecycle.fireLastHandler();
  });
  await expect.poll(async () => (await resizeSnapshot()).frameCount).toBe(framesBeforeStaleEvent);

  await setRoute("/ru");
  await expect(page.locator(".xterm-screen")).toBeVisible();
  await expect.poll(async () => (await resizeSnapshot()).activeCount).toBe(1);
  const framesBeforeViewportEvent = (await resizeSnapshot()).frameCount;

  await page.evaluate(() => window.visualViewport?.dispatchEvent(new Event("resize")));
  await expect.poll(async () => (await resizeSnapshot()).frameCount).toBeGreaterThan(framesBeforeViewportEvent);

  await setRoute("/__terminal-away-again");
  await expect(page.getByText("404 Page Not Found")).toBeVisible();
  await expect.poll(async () => (await resizeSnapshot()).activeCount).toBe(0);
});

test("terminal accepts typing and exposes reverse-search prompt", async ({ page }) => {
  await page.goto("/");

  const terminal = page.locator(".xterm-helper-textarea");
  await terminal.click();
  await page.keyboard.type("about");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+R");

  await expect(page.locator(".xterm-screen")).toContainText("reverse-i-search");
});

test("terminal advertises zsh plugin behavior", async ({ page }) => {
  await page.goto("/");

  const terminal = page.locator(".xterm-helper-textarea");
  await terminal.click();
  await page.keyboard.type("plugins");
  await page.keyboard.press("Enter");

  await expect(page.locator(".xterm-screen")).toContainText("zsh runtime");
  await expect(page.locator(".xterm-screen")).toContainText("autosuggestions");
});

test("mobile terminal stays usable and exposes touch shortcuts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const quickCommands = page.getByLabel("Terminal quick commands");
  await expect(quickCommands).toBeVisible();
  await expect(quickCommands.getByRole("button", { name: "Open keyboard" })).toBeVisible();

  await expect(quickCommands.getByRole("button", { name: "a", exact: true })).toBeVisible();
  await quickCommands.getByRole("button", { name: "a", exact: true }).click();
  await expect(page.locator(".xterm-screen")).toContainText("Permissions");
  await expect(page.locator(".xterm-screen")).toContainText("Git");
  await expect(page.locator(".xterm-helper-textarea")).not.toBeFocused();

  await quickCommands.getByRole("button", { name: "eza", exact: true }).click();
  await expect(page.locator(".xterm-helper-textarea")).not.toBeFocused();

  await quickCommands.getByRole("button", { name: "ls", exact: true }).click();
  await expect(page.locator(".terminal-surface")).toBeInViewport();
  await expect(page.locator(".terminal-surface")).toHaveCSS("min-height", "300px");
});

test("ls and eza are distinct and URL-backed files are terminal links", async ({ page }) => {
  await page.goto("/");
  const terminal = page.locator(".xterm-helper-textarea");
  await terminal.click();
  await page.keyboard.type("ls /projects");
  await page.keyboard.press("Enter");
  const linkedRow = page.locator(".xterm-rows > div").filter({ hasText: "lemma.txt" }).last();
  await expect(linkedRow).toContainText("lemma.txt");
  await page.evaluate(() => {
    (window as Window & { openedTerminalUrl?: string }).openedTerminalUrl = undefined;
    window.open = ((url?: string | URL) => {
      (window as Window & { openedTerminalUrl?: string }).openedTerminalUrl = String(url);
      return null;
    }) as typeof window.open;
  });
  await clickExpectedTerminalLink(page, linkedRow, "openedTerminalUrl", (value) => value === "https://www.geogebra.org/geometry/srsyvgca");
  await expect.poll(() => page.evaluate(() => (window as Window & { openedTerminalUrl?: string }).openedTerminalUrl)).toContain("geogebra.org");

  await page.keyboard.type("eza -la /projects");
  await page.keyboard.press("Enter");
  await expect(page.locator(".xterm-screen")).toContainText("Permissions");
  await page.keyboard.type("a /projects");
  await page.keyboard.press("Enter");
  await expect(page.locator(".xterm-screen")).toContainText("Owner");
  await expect(page.locator(".xterm-screen")).toContainText("Git");
  const aRow = page.locator(".xterm-rows > div").filter({ hasText: "lemma.txt" }).last();
  await expect(aRow).toContainText("lemma.txt");
  await page.evaluate(() => {
    (window as Window & { openedTerminalUrl?: string }).openedTerminalUrl = undefined;
  });
  await clickExpectedTerminalLink(page, aRow, "openedTerminalUrl", (value) => value === "https://www.geogebra.org/geometry/srsyvgca");
  await expect.poll(() => page.evaluate(() => (window as Window & { openedTerminalUrl?: string }).openedTerminalUrl)).toContain("geogebra.org");
});

test("same-origin relative terminal links open safely", async ({ page }) => {
  await page.goto("/");
  const terminal = page.locator(".xterm-helper-textarea");
  await terminal.click();
  await page.keyboard.type("ls /quicklinks");
  await page.keyboard.press("Enter");
  const linkedRow = page.locator(".xterm-rows > div").filter({ hasText: "cv.txt" }).last();
  await expect(linkedRow).toContainText("cv.txt");
  await page.evaluate(() => {
    (window as Window & { openedTerminalUrl?: string }).openedTerminalUrl = undefined;
    window.open = ((url?: string | URL) => {
      (window as Window & { openedTerminalUrl?: string }).openedTerminalUrl = String(url);
      return null;
    }) as typeof window.open;
  });
  await clickExpectedTerminalLink(page, linkedRow, "openedTerminalUrl", (value) => value === "/cv/en");
  await expect.poll(() => page.evaluate(() => (window as Window & { openedTerminalUrl?: string }).openedTerminalUrl)).toBe("/cv/en");
});

for (const lang of ["en", "ru"]) {
  for (const width of [1280, 320]) {
    test(`same-origin terminal links open safely: ${lang}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/${lang}`);
      await page.locator(".xterm-helper-textarea").click();
      await page.keyboard.type("ls /quicklinks");
      await page.keyboard.press("Enter");
      const linkedRow = page.locator(".xterm-rows > div").filter({ hasText: "cv.txt" }).last();
      await expect(linkedRow).toContainText("cv.txt");
      await page.evaluate(() => {
        (window as Window & { openedTerminalLink?: string[] }).openedTerminalLink = undefined;
        window.open = ((url?: string | URL, target?: string, features?: string) => {
          (window as Window & { openedTerminalLink?: string[] }).openedTerminalLink = [String(url), String(target), String(features)];
          return null;
        }) as typeof window.open;
      });
      await clickExpectedTerminalLink(page, linkedRow, "openedTerminalLink", (value) => Array.isArray(value) && value[0] === `/cv/${lang}` && value[1] === "_blank" && value[2] === "noopener,noreferrer");
      await expect.poll(() => page.evaluate(() => (window as Window & { openedTerminalLink?: string[] }).openedTerminalLink)).toEqual([`/cv/${lang}`, "_blank", "noopener,noreferrer"]);
    });
  }

  test(`mailto terminal links open safely: ${lang}`, async ({ page }) => {
    await page.goto(`/${lang}`);
    await page.locator(".xterm-helper-textarea").click();
    await page.keyboard.type("ls /contact");
    await page.keyboard.press("Enter");
    const filename = lang === "ru" ? "почта.txt" : "mail.txt";
    const linkedRow = page.locator(".xterm-rows > div").filter({ hasText: filename }).last();
    await expect(linkedRow).toContainText(filename);
    await page.evaluate(() => {
      (window as Window & { openedTerminalLink?: string[] }).openedTerminalLink = undefined;
      window.open = ((url?: string | URL, target?: string, features?: string) => {
        (window as Window & { openedTerminalLink?: string[] }).openedTerminalLink = [String(url), String(target), String(features)];
        return null;
      }) as typeof window.open;
    });
    await clickExpectedTerminalLink(page, linkedRow, "openedTerminalLink", (value) => Array.isArray(value) && value[0] === "mailto:ooodnakov@yandex.ru" && value[1] === "_blank" && value[2] === "noopener,noreferrer");
    await expect.poll(() => page.evaluate(() => (window as Window & { openedTerminalLink?: string[] }).openedTerminalLink)).toEqual(["mailto:ooodnakov@yandex.ru", "_blank", "noopener,noreferrer"]);
  });
}

test("the lightweight terminal does not fetch VM assets before opt-in", async ({ page }) => {
  const assetRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/browser-os/")) assetRequests.push(request.url());
  });
  await page.goto("/en");
  await expect(page.getByRole("button", { name: "Start opt-in OS preview" })).toBeVisible();
  expect(assetRequests).toEqual([]);
});

test("development missing browser OS assets return a real 404", async ({ request }) => {
  const response = await request.get("/browser-os/missing-release/manifest.json");
  expect(response.status()).toBe(404);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(await response.text()).not.toContain("<!doctype html>");
});

test("the opt-in worker surfaces a missing manifest and returns to lightweight mode", async ({ page }) => {
  await page.route("**/browser-os/**", (route) => route.abort());
  await page.goto("/en");
  await page.getByRole("button", { name: "Start opt-in OS preview" }).click();
  await expect(page.getByText("OS preview failed", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Stop · lightweight mode" }).click();
  await expect(page.getByRole("button", { name: "Start opt-in OS preview" })).toBeVisible();
});

test("the opt-in worker rejects an unpinned guest manifest before requesting assets", async ({ page }) => {
  const releaseRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/browser-os/")) releaseRequests.push(pathname);
  });
  await page.route("**/browser-os/**/manifest.json", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ schemaVersion: 1, release: "untrusted-release" }),
  }));
  await page.goto("/en");
  await page.getByRole("button", { name: "Start opt-in OS preview" }).click();
  await expect(page.getByText("OS preview failed", { exact: true })).toBeVisible();
  expect(releaseRequests).toEqual(["/browser-os/alpine-3.24.2-v86-0.5.469/manifest.json"]);
});

test("the opt-in worker rejects a mismatched guest build descriptor before requesting assets", async ({ page }) => {
  const releaseRequests: string[] = [];
  await page.route("**/browser-os/**/manifest.json", async (route) => {
    const response = await route.fetch();
    const manifest = await response.json();
    manifest.guest.buildId = "f".repeat(64);
    await route.fulfill({ response, json: manifest });
  });
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/browser-os/") && !pathname.endsWith("/manifest.json")) releaseRequests.push(pathname);
  });
  await page.goto("/en");
  await page.getByRole("button", { name: "Start opt-in OS preview" }).click();
  await expect(page.getByText("OS preview failed", { exact: true })).toBeVisible();
  expect(releaseRequests).toEqual([]);
});


test("opt-in guest worker keeps raw UTF-8 input and Ctrl+C independent of disabled quick actions", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_TEST_PRODUCTION !== "1", "The production asset pipeline generates the maintained guest.");
  test.setTimeout(240_000);
  const workerUrls: string[] = [];
  const wasmUrls: string[] = [];
  page.on("worker", (worker) => workerUrls.push(worker.url()));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/browser-os/") && url.pathname.endsWith(".wasm")) wasmUrls.push(url.href);
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/en");
  const screen = page.locator(".xterm-screen");
  const mobileClear = page.locator(".terminal-mobile-bar").getByRole("button", { name: "clear", exact: true });
  const mobileClearDom = page.locator(".terminal-mobile-bar button").filter({ hasText: /^clear$/ });
  await page.getByRole("button", { name: "Start opt-in OS preview" }).click();
  await expect(mobileClear).toBeDisabled();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(mobileClearDom).toBeHidden();
  expect(await mobileClearDom.evaluate((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  await expect(page.getByText(/Guest shell ready/)).toBeVisible({ timeout: 220_000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(mobileClear).toBeDisabled();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(mobileClearDom).toBeHidden();
  expect(await mobileClearDom.evaluate((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  const origin = new URL(page.url()).origin;
  expect(workerUrls.length).toBeGreaterThan(0);
  expect(workerUrls.every((url) => new URL(url).origin === origin)).toBe(true);
  expect(wasmUrls.some((url) => new URL(url).pathname.endsWith("/v86.wasm"))).toBe(true);
  expect(wasmUrls.every((url) => new URL(url).origin === origin)).toBe(true);

  const input = page.locator(".xterm-helper-textarea");
  await input.click();
  await page.keyboard.type("printf 'Привет Linux\\n' | tee /tmp/os-preview.txt | tr 'a-z' 'A-Z' > /tmp/os-preview.upper; pipeStatus=$?; cat /tmp/os-preview.txt /tmp/os-preview.upper; printf 'PIPE_EXIT=%d\\n' \"$pipeStatus\"");
  await page.keyboard.press("Enter");
  await expect(screen).toContainText("Привет Linux", { timeout: 30_000 });
  await expect(screen).toContainText("Привет LINUX", { timeout: 30_000 });
  await expect(screen).toContainText("PIPE_EXIT=0", { timeout: 30_000 });
  await input.click();
  await page.keyboard.type("printf 'A\\rB\\nC\\r\\nD\\n'");
  await page.keyboard.press("Enter");
  await expect(screen).toContainText("D", { timeout: 30_000 });
  const rows = await screen.locator(".xterm-rows > div").evaluateAll((elements) => elements.map((element) => element.textContent ?? ""));
  expect(rows.some((line) => line.trim() === "B")).toBe(true);
  expect(rows.some((line) => line.startsWith(" ") && line.trim() === "C")).toBe(true);


  await page.keyboard.type("sleep 30 & sleep_pid=$!; printf 'INTERRUPT_READY\\n'; wait \"$sleep_pid\"");
  await page.keyboard.press("Enter");
  await expect(screen).toContainText("INTERRUPT_READY", { timeout: 30_000 });
  await page.keyboard.press("Control+C");
  await page.keyboard.type("printf 'INTERRUPT_EXIT=%d\\n' \"$?\"");
  await page.keyboard.press("Enter");
  await expect(screen).toContainText("INTERRUPT_EXIT=130", { timeout: 30_000 });
});

test("a hash-pinned malformed primary v86 WASM falls back to the pinned fallback module", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_TEST_PRODUCTION !== "1", "The production asset pipeline generates the maintained guest.");
  test.setTimeout(240_000);
  const workerUrls: string[] = [];
  let fallbackRequested = false;
  const malformedPrimary = Buffer.from([0xff, 0x00, 0x01]);
  page.on("worker", (worker) => workerUrls.push(worker.url()));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/v86/v86-fallback.wasm")) fallbackRequested = true;
  });
  await page.route("**/browser-os/**/manifest.json", async (route) => {
    const response = await route.fetch();
    const manifest = await response.json();
    manifest.assets["v86/v86.wasm"] = {
      bytes: malformedPrimary.byteLength,
      sha256: createHash("sha256").update(malformedPrimary).digest("hex"),
    };
    await route.fulfill({ response, json: manifest });
  });
  await page.route("**/browser-os/**/v86/v86.wasm", (route) => route.fulfill({
    status: 200,
    contentType: "application/wasm",
    body: malformedPrimary,
  }));
  await page.goto("/en");
  await page.getByRole("button", { name: "Start opt-in OS preview" }).click();
  await expect(page.getByText(/Guest shell ready/)).toBeVisible({ timeout: 220_000 });
  await expect(page.getByRole("status").filter({
    hasText: "Verified fallback WASM selected after primary initialization failed.",
  })).toBeVisible();
  expect(fallbackRequested).toBe(true);
  expect(workerUrls.length).toBeGreaterThan(0);
  const screen = page.locator(".xterm-screen");
  await page.locator(".xterm-helper-textarea").click();
  await page.keyboard.type("printf 'fallback-pid=%s\\n' \"$$\"; printf 'FALLBACK_RESULT=%s\\n' \"$((6*7))\"");
  await page.keyboard.press("Enter");
  await expect(screen).toContainText(/fallback-pid=\d+/, { timeout: 30_000 });
  await expect(screen).toContainText("FALLBACK_RESULT=42", { timeout: 30_000 });
});

test("opt-in guest native actions expose truthful open and clipboard feedback", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_TEST_PRODUCTION !== "1", "The production asset pipeline generates the maintained guest.");
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException("denied", "NotAllowedError")) },
    });
    window.open = (() => { throw new DOMException("blocked", "NotAllowedError"); }) as typeof window.open;
  });
  await page.goto("/en");
  await page.getByRole("button", { name: "Start opt-in OS preview" }).click();
  await expect(page.getByText(/Guest shell ready/)).toBeVisible({ timeout: 220_000 });

  const input = page.locator(".xterm-helper-textarea");
  await input.click();
  await page.keyboard.type("open cv.txt");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Guest requests opening: quick-cv", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page.getByRole("status").filter({ hasText: "The link was rejected." })).toBeVisible();

  await page.evaluate(() => {
    window.open = (() => null) as typeof window.open;
  });
  await input.click();
  await page.keyboard.type("open cv.txt");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Guest requests opening: quick-cv", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page.getByRole("status").filter({
    hasText: "Open request sent; browser popup settings may block it.",
  })).toBeVisible();

  await input.click();
  await page.keyboard.type("copy-contact");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Guest requests copying the contact", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Clipboard copy failed." })).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
  });
  await input.click();
  await page.keyboard.type("copy-contact");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Guest requests copying the contact", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Contact copied." })).toBeVisible();
});

test("opt-in guest Worker resets cleanly and terminates when its terminal unmounts", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_TEST_PRODUCTION !== "1", "The production asset pipeline generates the maintained guest.");
  test.setTimeout(240_000);
  let workerCreations = 0;
  page.on("worker", () => { workerCreations += 1; });
  await page.goto("/en");
  await page.getByRole("button", { name: "Start opt-in OS preview" }).click();
  await expect(page.getByText(/Guest shell ready/)).toBeVisible({ timeout: 220_000 });
  expect(page.workers()).toHaveLength(1);
  const workerCountBeforeReset = workerCreations;
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect.poll(() => workerCreations).toBeGreaterThan(workerCountBeforeReset);
  await expect(page.getByText(/Guest shell ready/)).toBeVisible({ timeout: 220_000 });
  expect(page.workers()).toHaveLength(1);

  await page.evaluate(() => {
    history.pushState({}, "", "/__terminal-away");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByText("404 Page Not Found")).toBeVisible();
  await expect.poll(() => page.workers().length).toBe(0);
});
