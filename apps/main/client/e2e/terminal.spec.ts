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
