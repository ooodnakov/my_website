import { expect, test, type Locator, type Page } from "@playwright/test";

async function clickTerminalText(page: Page, rows: Locator, text: string) {
  const point = await rows.evaluate((element, target) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const textNodes: Node[] = [];
    let node = walker.nextNode();
    while (node) {
      textNodes.push(node);
      node = walker.nextNode();
    }
    const content = textNodes.map((textNode) => textNode.textContent ?? "").join("");
    const start = content.lastIndexOf(target);
    if (start < 0) return null;
    const end = start + target.length;
    let offset = 0;
    let startNode: Node | null = null;
    let startOffset = 0;
    let endNode: Node | null = null;
    let endOffset = 0;
    for (const textNode of textNodes) {
      const length = textNode.textContent?.length ?? 0;
      if (!startNode && start <= offset + length) {
        startNode = textNode;
        startOffset = start - offset;
      }
      if (!endNode && end <= offset + length) {
        endNode = textNode;
        endOffset = end - offset;
        break;
      }
      offset += length;
    }
    if (!startNode || !endNode) return null;
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const rect = range.getClientRects()[0];
    if (!rect) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, text);
  if (!point) throw new Error(`Could not locate ${text} in the terminal rows`);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator(".xterm-cursor-pointer")).toBeVisible();
  await page.mouse.click(point.x, point.y);
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
  await clickTerminalText(page, page.locator(".xterm-rows"), "lemma.txt");
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
  await clickTerminalText(page, page.locator(".xterm-rows"), "lemma.txt");
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
  await clickTerminalText(page, page.locator(".xterm-rows"), "cv.txt");
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
      await clickTerminalText(page, page.locator(".xterm-rows"), "cv.txt");
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
    await clickTerminalText(page, page.locator(".xterm-rows"), filename);
    await expect.poll(() => page.evaluate(() => (window as Window & { openedTerminalLink?: string[] }).openedTerminalLink)).toEqual(["mailto:ooodnakov@yandex.ru", "_blank", "noopener,noreferrer"]);
  });
}
