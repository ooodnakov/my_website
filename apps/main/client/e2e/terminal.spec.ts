import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { createHash } from "node:crypto";

type LinkCaptureField = "openedTerminalUrl" | "openedTerminalLink";

function readLabeledSize(rows: string[], label: string): [number, number] | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const resultPattern = new RegExp(`^${escapedLabel}=\\s*(\\d+)\\s+(\\d+)\\s*$`);
  // Later output wins: a repeated probe must never read its previous result.
  for (const row of [...rows].reverse()) {
    const match = resultPattern.exec(row.trim());
    if (match) return [Number(match[1]), Number(match[2])];
  }
  return null;
}

const GUEST_RELEASE = "alpine-3.24.3-v86-0.5.469";

async function requireGeneratedGuestManifest(page: Page) {
  const path = `/browser-os/${GUEST_RELEASE}/manifest.json`;
  const response = await page.request.get(path);
  if (!response.ok()) {
    throw new Error(`Generated-guest test requires ${path}; received HTTP ${response.status()}`);
  }

  const manifest = await response.json() as {
    schemaVersion?: unknown;
    release?: unknown;
    guest?: { buildId?: unknown; buildIdentityPath?: unknown };
    assets?: Record<string, { bytes?: unknown; sha256?: unknown }>;
  };
  const buildId = manifest.guest?.buildId;
  const identityPath = manifest.guest?.buildIdentityPath;
  const identityAsset = typeof identityPath === "string" ? manifest.assets?.[identityPath] : undefined;
  if (manifest.schemaVersion !== 1
    || manifest.release !== GUEST_RELEASE
    || typeof buildId !== "string"
    || !/^[0-9a-f]{64}$/.test(buildId)
    || !identityAsset
    || identityAsset.sha256 !== buildId
    || !Number.isSafeInteger(identityAsset.bytes)
    || (identityAsset.bytes as number) <= 0) {
    throw new Error(`Generated-guest test requires a manifest with a matching embedded build-identity asset: ${path}`);
  }
}

type ForegroundSample = { rows: number; cols: number; pgid: number; shellPgid: number };

function readForegroundTuiSizes(rows: string[], label: "LESS" | "NANO"): ForegroundSample[] {
  const resultPattern = new RegExp(`^${label}_FG_SIZE=\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*$`);
  return rows.flatMap((row) => {
    const match = resultPattern.exec(row.trim());
    if (!match) return [];
    return [{
      rows: Number(match[1]),
      cols: Number(match[2]),
      pgid: Number(match[3]),
      shellPgid: Number(match[4]),
    }];
  });
}

// A resize is only proven when the wide and narrow readings belong to one
// foreground lifetime: the tty belongs to the TUI the visitor is looking at,
// not to samples taken before entry or after exit, not to two separate TUI
// runs, and not in reverse order.
function hasSustainedForegroundResize(
  samples: ForegroundSample[],
  wide: [number, number],
  narrow: [number, number],
) {
  const foreground = samples.filter((sample) => sample.pgid !== sample.shellPgid);
  if (foreground.length === 0) return false;
  const [lifetime] = foreground;
  if (foreground.some((sample) => sample.pgid !== lifetime.pgid)) return false;
  const wideIndex = foreground.findIndex((sample) => sample.rows === wide[0] && sample.cols === wide[1]);
  const narrowIndex = foreground.findIndex((sample) => sample.rows === narrow[0] && sample.cols === narrow[1]);
  return wideIndex >= 0 && narrowIndex > wideIndex;
}

// The monitor reads field 8 of /proc/<shell>/stat — the tty's foreground
// process group — and records only when the same foreground group is still
// current after the size read, so a sample always names the TUI that owned the
// tty and never the shell's own process group.
function guestResizeMonitor(label: "LESS" | "NANO") {
  const sizesFile = `/tmp/${label.toLowerCase()}-sizes`;
  return {
    start: `: > ${sizesFile}; shell_pid=$$; read -r proc_pid comm state ppid shell_pgrp session tty_nr tpgid rest < "/proc/$shell_pid/stat"; (while :; do read -r proc_pid comm state ppid pgrp session tty_nr foreground_before rest < "/proc/$shell_pid/stat" || break; if [ "$foreground_before" != "$shell_pgrp" ]; then size=$(stty size </dev/tty 2>/dev/null); read -r proc_pid comm state ppid pgrp session tty_nr foreground_after rest < "/proc/$shell_pid/stat" || break; if [ -n "$size" ] && [ "$foreground_after" = "$foreground_before" ]; then printf '%s %s %s\\n' "$size" "$foreground_before" "$shell_pgrp" >> ${sizesFile}; fi; fi; sleep 0.1; done) </dev/null >/dev/null 2>&1 & resize_watcher=$!`,
    stop: `kill "$resize_watcher" 2>/dev/null; wait "$resize_watcher" 2>/dev/null; while IFS= read -r size; do printf '${label}_FG_SIZE=%s\\n' "$size"; done < ${sizesFile}`,
  };
}

async function renderedTokensInRow(rows: Locator, marker: string, token: RegExp): Promise<number | null> {
  const lines = await rows.allTextContents();
  const line = lines.find((text) => text.includes(marker));
  return line ? (line.match(token) ?? []).length : null;
}

// Reflow requires retained content: the marker row must still render after the
// resize with fewer tokens. A vanished row is not a reflow, and neither is a
// row that never contained tokens.
function hasRenderedReflow(wide: number | null, narrow: number | null) {
  return wide !== null && narrow !== null && wide > 0 && narrow > 0 && narrow < wide;
}

test("active-TUI resize selection requires one ordered foreground lifetime", () => {
  const wide: [number, number] = [42, 120];
  const narrow: [number, number] = [24, 40];
  const read = (rows: string[]) => readForegroundTuiSizes(rows, "LESS");
  const accepts = (samples: ForegroundSample[]) => hasSustainedForegroundResize(samples, wide, narrow);

  // Sizes collected before the TUI starts and after it exits are not TUI readings.
  expect(accepts(read(["LESS_SIZE=42 120", "LESS_SIZE=24 40"]))).toBe(false);
  // Two unrelated foreground process groups are two lifetimes, not one resize.
  expect(accepts(read(["LESS_FG_SIZE=42 120 701 700", "LESS_FG_SIZE=24 40 702 700"]))).toBe(false);
  // The shell's own group is never the foreground group.
  expect(accepts(read(["LESS_FG_SIZE=42 120 700 700", "LESS_FG_SIZE=24 40 700 700"]))).toBe(false);
  // Narrowing first, widening later is the opposite of the resize under test.
  expect(accepts(read(["LESS_FG_SIZE=24 40 701 700", "LESS_FG_SIZE=42 120 701 700"]))).toBe(false);
  // Only one of the two geometries was observed.
  expect(accepts(read(["LESS_FG_SIZE=42 120 701 700"]))).toBe(false);
  // A sustained wide-then-narrow lifetime in one group is the accepted shape.
  expect(accepts(read(["LESS_FG_SIZE=42 120 701 700", "LESS_FG_SIZE=24 40 701 700"]))).toBe(true);
  expect(readForegroundTuiSizes(["NANO_FG_SIZE=42 120 700 700"], "NANO")).toEqual([
    { rows: 42, cols: 120, pgid: 700, shellPgid: 700 },
  ]);
});

test("rendered reflow requires retained content after the resize", () => {
  // A row that disappears is not a reflow, however few tokens it "has".
  expect(hasRenderedReflow(null, 5)).toBe(false);
  expect(hasRenderedReflow(15, null)).toBe(false);
  // Neither is a row that never carried the wrapped tokens.
  expect(hasRenderedReflow(15, 0)).toBe(false);
  expect(hasRenderedReflow(0, 0)).toBe(false);
  // Nor is growing content.
  expect(hasRenderedReflow(5, 15)).toBe(false);
  // Retained content that wraps into fewer tokens per row is the accepted shape.
  expect(hasRenderedReflow(15, 5)).toBe(true);
});


test("terminal resize result selection ignores the echoed command", () => {
  const commandEcho = `size=$(stty size); printf 'TERM_WIDE=%s\\n' "$size"`;
  expect(readLabeledSize([commandEcho], "TERM_WIDE")).toBeNull();
  expect(readLabeledSize([commandEcho, "TERM_WIDE= 42 120"], "TERM_WIDE")).toEqual([42, 120]);
});


async function clickExpectedTerminalLink(
  page: Page,
  row: Locator,
  targetText: string,
  field: LinkCaptureField,
  isExpected: (value: string | string[] | undefined) => boolean,
) {
  const screenBounds = await page.locator(".xterm-screen").boundingBox();
  const rowBounds = await row.boundingBox();
  if (!screenBounds || !rowBounds) throw new Error("The terminal link row has no browser bounds");
  const rowText = await row.textContent() ?? "";
  const targetIndex = rowText.lastIndexOf(targetText);
  if (targetIndex < 0) throw new Error(`The terminal row does not contain ${JSON.stringify(targetText)}`);
  const cellWidth = await page.locator(".xterm-char-measure-element").first().evaluate((element) => element.getBoundingClientRect().width / 32);
  if (!Number.isFinite(cellWidth)) throw new Error("The terminal cell width is unavailable");
  const x = screenBounds.x + (targetIndex + targetText.length / 2) * cellWidth;
  const y = rowBounds.y + rowBounds.height / 2;
  const pointerCursor = page.locator(".xterm-cursor-pointer");

  await page.mouse.move(x, y);
  if (await pointerCursor.count() === 0) throw new Error(`The requested terminal link ${JSON.stringify(targetText)} is not clickable at its rendered position`);
  await page.mouse.click(x, y);
  const opened = await page.evaluate((key) => {
    const testWindow = window as Window & { openedTerminalUrl?: string; openedTerminalLink?: string[] };
    return testWindow[key];
  }, field);
  if (!isExpected(opened)) {
    throw new Error(`The requested terminal link opened ${JSON.stringify(opened) ?? "nothing"}`);
  }
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
  await clickExpectedTerminalLink(page, linkedRow, "lemma.txt", "openedTerminalUrl", (value) => value === "https://www.geogebra.org/geometry/srsyvgca");
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
  await clickExpectedTerminalLink(page, aRow, "lemma.txt", "openedTerminalUrl", (value) => value === "https://www.geogebra.org/geometry/srsyvgca");
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
  await clickExpectedTerminalLink(page, linkedRow, "cv.txt", "openedTerminalUrl", (value) => value === "/cv/en");
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
      await clickExpectedTerminalLink(page, linkedRow, "cv.txt", "openedTerminalLink", (value) => Array.isArray(value) && value[0] === `/cv/${lang}` && value[1] === "_blank" && value[2] === "noopener,noreferrer");
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
    await clickExpectedTerminalLink(page, linkedRow, filename, "openedTerminalLink", (value) => Array.isArray(value) && value[0] === "mailto:ooodnakov@yandex.ru" && value[1] === "_blank" && value[2] === "noopener,noreferrer");
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

test("cold opt-in requests a missing manifest and returns to lightweight mode across sessions", async ({ page, context }) => {
  test.setTimeout(60_000);
  const expectedManifestPath = `/browser-os/${GUEST_RELEASE}/manifest.json`;
  const manifestRequests: Request[] = [];
  const workerUrls: string[] = [];
  const runtimeErrors: string[] = [];
  const navigationsAfterOptIn: string[] = [];
  let activated = false;
  context.on("request", (request) => {
    if (new URL(request.url()).pathname === expectedManifestPath) manifestRequests.push(request);
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("worker", (worker) => workerUrls.push(worker.url()));
  page.on("framenavigated", (frame) => {
    if (activated && frame.parentFrame() === null) navigationsAfterOptIn.push(frame.url());
  });
  await context.route(`**${expectedManifestPath}`, (route) => route.fulfill({
    status: 404,
    contentType: "application/json",
    body: JSON.stringify({ message: "Browser OS asset not found" }),
  }));
  await page.goto("/en");
  await expect(page.locator(".xterm-screen")).toBeVisible();
  const optIn = page.getByRole("button", { name: "Start opt-in OS preview" });
  await expect(optIn).toBeVisible();

  for (const expectedCount of [1, 2]) {
    activated = true;
    await optIn.click();
    const stop = page.getByRole("button", { name: "Stop · lightweight mode" });
    await expect(stop).toBeVisible({ timeout: 15_000 });
    await expect.poll(
      () => manifestRequests.length,
      {
        timeout: 15_000,
        message: () => `manifest requests ${manifestRequests.length}; expected ${expectedCount}; workers: ${workerUrls.join(", ") || "none"}; navigations after opt-in: ${navigationsAfterOptIn.join(", ") || "none"}; page errors: ${runtimeErrors.join("; ") || "none"}`,
      },
    ).toBe(expectedCount);
    const response = await manifestRequests[expectedCount - 1].response();
    expect(response?.status()).toBe(404);
    await expect(page.getByText("OS preview failed", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
    await expect(stop).toBeVisible();
    await page.getByRole("button", { name: "Stop · lightweight mode" }).click();
    await expect(optIn).toBeVisible();
  }
  expect(manifestRequests).toHaveLength(2);
  // A dev-server reload mid-activation discards the session before its worker
  // requests the manifest, so cold opt-in must not navigate the page.
  expect(navigationsAfterOptIn).toEqual([]);
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
  expect(releaseRequests).toEqual(["/browser-os/alpine-3.24.3-v86-0.5.469/manifest.json"]);
});

test("the opt-in worker rejects a mismatched guest build descriptor before requesting assets", async ({ page }) => {
  const releaseRequests: string[] = [];
  await requireGeneratedGuestManifest(page);
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
  test.setTimeout(480_000);
  await requireGeneratedGuestManifest(page);
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
  await expect(page.getByText(/Guest shell ready/)).toBeVisible({ timeout: 300_000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(mobileClear).toBeDisabled();
  const mobileQuickActions = page.locator(".terminal-mobile-bar button:not(.terminal-keyboard-button)");
  await expect(mobileQuickActions).toHaveCount(5);
  expect(await mobileQuickActions.evaluateAll((buttons) =>
    buttons.every((button) => (button as HTMLButtonElement).disabled),
  )).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(mobileClearDom).toBeHidden();
  expect(await mobileClearDom.evaluate((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  const input = page.locator(".xterm-helper-textarea");
  // COM1 input and COM2 resize are independent transports, so a command typed
  // right after a viewport change can reach the guest before the daemon applies
  // TIOCSWINSZ. Re-probe with a unique label until the guest reports the new
  // geometry; a resize that never lands still fails the final assertion.
  const readGuestSize = async (label: string, differentFrom?: number) => {
    const deadline = Date.now() + 25_000;
    let latest: [number, number] | null = null;
    for (let attempt = 1; Date.now() < deadline; attempt += 1) {
      const attemptLabel = `${label}_${attempt}`;
      await input.click();
      await page.keyboard.type(`size=$(stty size); printf '${attemptLabel}=%s\\n' "$size"`);
      await page.keyboard.press("Enter");
      const read = async () => {
        const rows = await screen.locator(".xterm-rows > div").allTextContents();
        return readLabeledSize(rows, attemptLabel);
      };
      await expect.poll(read, { timeout: 15_000 }).not.toBeNull();
      latest = await read();
      if (latest && (differentFrom === undefined || latest[1] !== differentFrom)) return latest;
      await page.waitForTimeout(250);
    }
    throw new Error(`Guest did not report ${label} columns different from ${differentFrom}; last ${JSON.stringify(latest)}`);
  };
  const wideSize = await readGuestSize("TERM_WIDE");
  await page.setViewportSize({ width: 390, height: 844 });
  const narrowSize = await readGuestSize("TERM_NARROW", wideSize[1]);
  expect(narrowSize[1]).toBeLessThan(wideSize[1]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "[RU]" }).click();
  await expect(page).toHaveURL(/\/ru$/);
  await input.click();
  await page.keyboard.type("tour");
  await page.keyboard.press("Enter");
  await expect(screen).toContainText("Тур", { timeout: 30_000 });
  expect(page.workers()).toHaveLength(1);
  await page.getByRole("link", { name: "[EN]" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await input.click();
  await page.keyboard.type("tour");
  await page.keyboard.press("Enter");
  await expect(screen).toContainText("Tour", { timeout: 30_000 });
  expect(page.workers()).toHaveLength(1);

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
  await input.click();
  await page.keyboard.type("for i in $(seq 0 39); do printf 'WRAP%02d ' \"$i\"; done > /tmp/less.txt; for i in {1..100}; do echo LESS_LINE_$i; done >> /tmp/less.txt");
  await page.keyboard.press("Enter");
  const lessMonitor = guestResizeMonitor("LESS");
  await input.click();
  await page.keyboard.type(`${lessMonitor.start}; LESS='' less /tmp/less.txt; ${lessMonitor.stop}`);
  await page.keyboard.press("Enter");
  await expect(screen).toContainText("LESS_LINE_1", { timeout: 30_000 });
  await expect(screen.locator(".xterm-rows > div")).toHaveCount(wideSize[0], { timeout: 30_000 });
  const wideLessTokens = await renderedTokensInRow(screen.locator(".xterm-rows > div"), "WRAP00", /WRAP\d\d/g);
  expect(wideLessTokens).not.toBeNull();
  expect(wideLessTokens!).toBeGreaterThan(6);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(screen.locator(".xterm-rows > div")).toHaveCount(narrowSize[0], { timeout: 30_000 });
  await expect(screen).toContainText("LESS_LINE_1");
  await expect.poll(
    async () => hasRenderedReflow(wideLessTokens, await renderedTokensInRow(screen.locator(".xterm-rows > div"), "WRAP00", /WRAP\d\d/g)),
    { timeout: 30_000 },
  ).toBe(true);
  const narrowLessTokens = await renderedTokensInRow(screen.locator(".xterm-rows > div"), "WRAP00", /WRAP\d\d/g);
  expect(narrowLessTokens).not.toBeNull();
  expect(narrowLessTokens!).toBeGreaterThan(0);
  await page.keyboard.press("q");
  let lessForegroundSizes: ForegroundSample[] = [];
  await expect.poll(async () => {
    const rows = await screen.locator(".xterm-rows > div").allTextContents();
    lessForegroundSizes = readForegroundTuiSizes(rows, "LESS");
    return hasSustainedForegroundResize(lessForegroundSizes, wideSize, narrowSize);
  }, { timeout: 30_000 }).toBe(true);
  await input.click();
  await page.keyboard.type("printf 'AFTER_LESS=%s\\n' \"$((20+22))\"");
  await page.keyboard.press("Enter");

  await expect(screen).toContainText("AFTER_LESS=42", { timeout: 30_000 });
  await page.setViewportSize({ width: 1280, height: 900 });

  await input.click();
  await page.keyboard.type("printf 'EDITOR_TEXT\\n' > /tmp/preview.txt; for i in $(seq 0 39); do printf 'WRAP%02d ' \"$i\"; done >> /tmp/preview.txt");
  await page.keyboard.press("Enter");
  const nanoMonitor = guestResizeMonitor("NANO");
  await input.click();
  await page.keyboard.type(`${nanoMonitor.start}; nano /tmp/preview.txt; ${nanoMonitor.stop}`);
  await page.keyboard.press("Enter");
  const nanoRows = screen.locator(".xterm-rows > div");
  await expect.poll(async () => {
    const renderedRows = await nanoRows.allTextContents();
    return renderedRows.some((line) => /GNU nano/.test(line))
      && renderedRows.some((line) => line.includes("^X Exit"))
      && renderedRows.some((line) => line.trim() === "EDITOR_TEXT");
  }, { timeout: 30_000 }).toBe(true);
  await expect(nanoRows).toHaveCount(wideSize[0], { timeout: 30_000 });
  const wideNanoTokens = await renderedTokensInRow(nanoRows, "WRAP00", /WRAP\d\d/g);
  expect(wideNanoTokens).not.toBeNull();
  expect(wideNanoTokens!).toBeGreaterThan(6);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(nanoRows).toHaveCount(narrowSize[0], { timeout: 30_000 });
  await expect.poll(async () => {
    const renderedRows = await nanoRows.allTextContents();
    return renderedRows.some((line) => /GNU nano/.test(line))
      && renderedRows.some((line) => line.includes("^X Exit"))
      && renderedRows.some((line) => line.trim() === "EDITOR_TEXT");
  }, { timeout: 30_000 }).toBe(true);
  await expect.poll(
    async () => hasRenderedReflow(wideNanoTokens, await renderedTokensInRow(nanoRows, "WRAP00", /WRAP\d\d/g)),
    { timeout: 30_000 },
  ).toBe(true);
  const narrowNanoTokens = await renderedTokensInRow(nanoRows, "WRAP00", /WRAP\d\d/g);
  expect(narrowNanoTokens).not.toBeNull();
  expect(narrowNanoTokens!).toBeGreaterThan(0);
  await page.keyboard.press("Control+X");
  let nanoForegroundSizes: ForegroundSample[] = [];
  await expect.poll(async () => {
    const rows = await screen.locator(".xterm-rows > div").allTextContents();
    nanoForegroundSizes = readForegroundTuiSizes(rows, "NANO");
    return hasSustainedForegroundResize(nanoForegroundSizes, wideSize, narrowSize);
  }, { timeout: 30_000 }).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await input.click();
  await page.keyboard.type("printf 'AFTER_NANO=%s\\n' \"$(cat /tmp/preview.txt)\"");
  await page.keyboard.press("Enter");
  await expect(screen).toContainText("AFTER_NANO=EDITOR_TEXT", { timeout: 30_000 });
});

test("a hash-pinned malformed primary v86 WASM falls back to the pinned fallback module", async ({ page }) => {
  test.setTimeout(240_000);
  await requireGeneratedGuestManifest(page);
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
  await expect(page.getByText(/Guest shell ready/)).toBeVisible({ timeout: 300_000 });
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
  test.setTimeout(240_000);
  await requireGeneratedGuestManifest(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException("denied", "NotAllowedError")) },
    });
    window.open = (() => { throw new DOMException("blocked", "NotAllowedError"); }) as typeof window.open;
  });
  await page.goto("/en");
  await page.getByRole("button", { name: "Start opt-in OS preview" }).click();
  await expect(page.getByText(/Guest shell ready/)).toBeVisible({ timeout: 300_000 });

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
  test.setTimeout(480_000);
  await requireGeneratedGuestManifest(page);
  let workerCreations = 0;
  page.on("worker", () => { workerCreations += 1; });
  await page.goto("/en");
  await page.getByRole("button", { name: "Start opt-in OS preview" }).click();
  await expect(page.getByText(/Guest shell ready/)).toBeVisible({ timeout: 300_000 });
  expect(page.workers()).toHaveLength(1);
  for (let reset = 0; reset < 2; reset += 1) {
    const workerCountBeforeReset = workerCreations;
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect.poll(() => workerCreations).toBeGreaterThan(workerCountBeforeReset);
    await expect(page.getByText(/Guest shell ready/)).toBeVisible({ timeout: 300_000 });
    expect(page.workers()).toHaveLength(1);
  }

  await page.evaluate(() => {
    history.pushState({}, "", "/__terminal-away");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByText("404 Page Not Found")).toBeVisible();
  await expect.poll(() => page.workers().length).toBe(0);
});
