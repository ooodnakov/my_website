import { expect, test } from "@playwright/test";

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
  const rowText = await linkedRow.textContent() ?? "";
  const filenameOffset = rowText.indexOf("lemma.txt");
  const characterWidth = await page.locator(".xterm-char-measure-element").first().evaluate((element) => element.getBoundingClientRect().width / 32);
  const rowBox = await linkedRow.boundingBox();
  expect(rowBox).not.toBeNull();
  await page.mouse.click(rowBox!.x + characterWidth * (filenameOffset + 4), rowBox!.y + rowBox!.height / 2);
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
  const aRowText = await aRow.textContent() ?? "";
  const aFilenameOffset = aRowText.indexOf("lemma.txt");
  const aRowBox = await aRow.boundingBox();
  expect(aRowBox).not.toBeNull();
  await page.mouse.click(aRowBox!.x + characterWidth * (aFilenameOffset + 4), aRowBox!.y + aRowBox!.height / 2);
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
  const rowText = await linkedRow.textContent() ?? "";
  const filenameOffset = rowText.indexOf("cv.txt");
  const characterWidth = await page.locator(".xterm-char-measure-element").first().evaluate((element) => element.getBoundingClientRect().width / 32);
  const rowBox = await linkedRow.boundingBox();
  expect(rowBox).not.toBeNull();
  await page.mouse.click(rowBox!.x + characterWidth * (filenameOffset + 2), rowBox!.y + rowBox!.height / 2);
  await expect.poll(() => page.evaluate(() => (window as Window & { openedTerminalUrl?: string }).openedTerminalUrl)).toBe("/cv/en");
});
