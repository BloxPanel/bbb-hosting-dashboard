import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Enter demo workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Jamie." }),
  ).toBeVisible();
});
test("create, filter, rename and delete a website", async ({ page }) => {
  await page.getByRole("button", { name: "Create website" }).first().click();
  const createDialog = page.getByRole("dialog", {
    name: "A new home for your idea",
  });
  const originalViewport = page.viewportSize()!;
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const bounds = await createDialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.abs(bounds!.x + bounds!.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds!.y + bounds!.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(1);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize(originalViewport);
  await expect(createDialog.getByLabel("Website name", { exact: true })).toBeVisible();
  await expect(createDialog.getByLabel("Subdomain")).toBeVisible();
  await expect(createDialog.locator(".website-address-preview")).toBeVisible();
  await expect(createDialog).toHaveCSS("overflow-y", "auto");
  await createDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(createDialog).toHaveCount(0);

  await page.getByRole("button", { name: "Create website" }).first().click();
  const reopenedDialog = page.getByRole("dialog", {
    name: "A new home for your idea",
  });
  await reopenedDialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(reopenedDialog).toHaveCount(0);

  await page.getByRole("button", { name: "Create website" }).first().click();
  await page.getByLabel("Website name", { exact: true }).fill("A test project");
  await page.getByRole("button", { name: "Create demo draft" }).click();
  await page
    .locator("main")
    .getByRole("link", { name: "View all websites" })
    .click();
  await page
    .getByRole("textbox", { name: "Search websites" })
    .fill("A test project");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("link", { name: "Manage", exact: true }).click();
  await page
    .locator(".tabs")
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  await page
    .getByLabel("Website name", { exact: true })
    .fill("Renamed project");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "Renamed project", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete website", exact: true })
    .click();
  await page
    .getByLabel("Type the website name to confirm")
    .fill("Renamed project");
  await page.getByRole("button", { name: "Delete demo website" }).click();
  await expect(
    page.getByRole("heading", { name: "Websites", exact: true }),
  ).toBeVisible();
});
test("every site route, file upload and demo billing isolation", async ({
  page,
}) => {
  await page
    .locator("main")
    .getByRole("link", { name: "Manage", exact: true })
    .first()
    .click();
  for (const name of [
    "Files",
    "Domains",
    "Deployments",
    "Billing",
    "Settings",
    "Overview",
  ]) {
    await page
      .locator(".tabs")
      .getByRole("link", { name, exact: true })
      .click();
    await expect(page.locator("main")).toBeVisible();
  }
  await page
    .locator(".tabs")
    .getByRole("link", { name: "Files", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open folder assets" }),
  ).toHaveCount(1);
  const demoFileApiRequests: string[] = [];
  await page.route(
    "https://api.builtbybuzz.dev/v1/projects/**/files**",
    async (route) => {
      demoFileApiRequests.push(route.request().url());
      await route.fulfill({ status: 500, json: { success: false } });
    },
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Demo file contents"),
  });
  await expect(
    page.getByRole("button", { name: "hello.txt", exact: true }),
  ).toBeVisible();
  expect(demoFileApiRequests).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Preview hello.txt" }).click();
  await expect(page.getByRole("dialog")).toContainText("Demo file contents");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator(".tabs")
    .getByRole("link", { name: "Billing", exact: true })
    .click();
  await page.getByRole("button", { name: "Manage subscription" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "no entitlement was changed",
  );
  await page
    .locator(".tabs")
    .getByRole("link", { name: "Files", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "hello.txt", exact: true }),
  ).toBeVisible();
});
test("responsive navigation and account routes", async ({ page }, info) => {
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      overflow: Array.from(document.querySelectorAll("body *"))
        .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1)
        .map((e) => e.tagName + "." + e.className),
    })),
  ).toMatchObject({ width: info.project.name === "mobile" ? 390 : 1440 });
  await page.screenshot({
    path: `/tmp/bbb-dashboard-${info.project.name}.png`,
    fullPage: true,
  });
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.locator("aside")).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await page
    .locator("aside")
    .getByRole("link", { name: "Billing", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Billing", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText("$30");
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .locator("aside")
    .getByRole("link", { name: "Account settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Account settings", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("global API project count stays separate from demo website statistics", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Log out" }).click();
  const requests: string[] = [];
  await page.route("https://api.builtbybuzz.dev/**", async (route) => {
    requests.push(route.request().url());
    await route.fulfill({ json: { success: true, total: 943 } });
  });
  await page.getByRole("button", { name: "Read global project count" }).click();
  await expect(page.getByRole("status")).toContainText(
    "not your website count",
  );
  await expect(page.getByRole("status")).toContainText("943");
  expect(requests).toEqual([
    "https://api.builtbybuzz.dev/v1/dev/project-count",
  ]);
  await page.getByRole("button", { name: "Enter demo workspace" }).click();
  await expect(page.locator("main")).not.toContainText("943");
});

test("demo code editor edits supported text locally and protects unsaved work", async ({ page }) => {
  await page
    .locator("main")
    .getByRole("link", { name: "Manage", exact: true })
    .first()
    .click();
  await page
    .locator(".tabs")
    .getByRole("link", { name: "Files", exact: true })
    .click();

  const fileApiRequests: string[] = [];
  await page.route("https://api.builtbybuzz.dev/v1/projects/**/files**", async (route) => {
    fileApiRequests.push(route.request().url());
    await route.fulfill({ status: 500, json: { success: false } });
  });
  for (const [name, mimeType, contents] of [
    ["app.css", "text/css", "body { color: red; }"],
    ["app.js", "text/javascript", "const answer = 42;"],
  ]) {
    await page.locator("input[type=file]").setInputFiles({
      name,
      mimeType,
      buffer: Buffer.from(contents),
    });
    await expect(page.getByRole("button", { name: `Edit ${name}` })).toBeVisible();
  }

  for (const [name, content] of [
    ["index.html", "<h1>Updated demo HTML</h1>"],
    ["app.css", "body { color: blue; }"],
    ["app.js", "const answer = 99;"],
  ]) {
    await page.getByRole("button", { name: `Edit ${name}` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(`Code editor for ${name}`)).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator(".cm-gutterElement:visible").first()).toBeVisible();
    await expect(dialog.locator(".cm-content")).toHaveAttribute(
      "aria-describedby",
      "editor-keyboard-help",
    );
    if (name === "index.html") {
      await dialog.locator(".cm-content").press("Tab");
      expect(
        await dialog.locator(".cm-content").evaluate((element) => element.textContent),
      ).toContain("\t");
      const originalViewport = page.viewportSize()!;
      for (const viewport of [
        { width: 1366, height: 768 },
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
        { width: 768, height: 1024 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        const bounds = await dialog.boundingBox();
        expect(bounds).not.toBeNull();
        expect(Math.abs(bounds!.x + bounds!.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }
      await page.setViewportSize(originalViewport);
    }
    const wrapToggle = dialog.getByRole("button", { name: "Toggle line wrapping" });
    await expect(wrapToggle).toHaveAttribute("aria-pressed", "false");
    await expect(dialog.locator(".cm-line").first()).toHaveCSS("white-space", "pre");
    await wrapToggle.click();
    await expect(wrapToggle).toHaveAttribute("aria-pressed", "true");
    expect(
      await dialog.locator(".cm-line").first().evaluate((element) => getComputedStyle(element).whiteSpace),
    ).not.toBe("pre");
    await wrapToggle.click();
    const bounds = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(bounds).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(viewport!.width * 0.85);
    expect(bounds!.height).toBeGreaterThan(viewport!.height * 0.8);
    if (name === "index.html") {
      await expect(dialog.locator(".cm-line span").first()).toBeVisible();
      const syntaxColor = await dialog
        .locator(".cm-line span")
        .first()
        .evaluate((element) => getComputedStyle(element).color);
      expect(syntaxColor).not.toBe("rgb(213, 222, 234)");
    }
    await dialog.locator(".cm-content").fill(content);
    await dialog.locator(".cm-content").press("Control+End");
    await expect(dialog.locator(".editor-statusbar")).toContainText(
      `Ln 1, Col ${content.length + 1}`,
    );
    await expect(dialog).toContainText("Unsaved changes");
    await expect(dialog.locator(".editor-statusbar")).toContainText("Unsaved");
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await page.keyboard.press("Control+f");
    await expect(dialog.locator(".cm-search")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+s");
    await expect(page.getByRole("alert")).toContainText(
      "Changes saved to local demo memory only",
    );
    await expect(dialog).not.toContainText("Unsaved changes");
    await expect(dialog.locator(".editor-statusbar")).toContainText("Saved");
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Close dialog" }).click();
  }

  await page.getByRole("button", { name: "Edit index.html" }).click();
  const editorDialog = page.getByRole("dialog");
  await expect(editorDialog.locator(".cm-content")).toContainText("Updated demo HTML");
  await editorDialog.locator(".cm-content").fill("<h1>Not saved</h1>");
  page.once("dialog", (dialog) => void dialog.dismiss());
  await editorDialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(editorDialog).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await editorDialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Edit index.html" }).click();
  await page.getByRole("dialog").locator(".cm-content").fill("<h1>Back guard</h1>");
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.goBack();
  await expect(page).toHaveURL(/\/files$/);
  await expect(page.getByRole("dialog")).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.goBack();
  await expect(page).not.toHaveURL(/\/files$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator(".tabs")
    .getByRole("link", { name: "Files", exact: true })
    .click();

  await page.locator("input[type=file]").setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71]),
  });
  await expect(page.getByRole("button", { name: "Edit photo.png" })).toHaveCount(0);
  await page.locator("input[type=file]").setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([0xc3, 0x28]),
  });
  await expect(page.locator(".bbb-error-display")).toContainText("could not be uploaded");
  await expect(page.getByRole("button", { name: "Edit invalid.txt" })).toHaveCount(0);
  await page.locator("input[type=file]").setInputFiles({
    name: "large.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(1024 * 1024 + 1, 97),
  });
  await page.getByRole("button", { name: "Edit large.txt" }).click();
  const sizeDialog = page.getByRole("dialog");
  await expect(sizeDialog).toContainText("Inline editing is limited to 1.0 MiB");
  await expect(sizeDialog.locator(".cm-editor")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await sizeDialog.getByRole("button", { name: "Close dialog" }).click();
  expect(fileApiRequests).toEqual([]);
});

test("CodeMirror search, replace and keyboard navigation stay usable", async ({ page }) => {
  await page
    .locator("main")
    .getByRole("link", { name: "Manage", exact: true })
    .first()
    .click();
  await page
    .locator(".tabs")
    .getByRole("link", { name: "Files", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "search-test.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("alpha beta alpha"),
  });
  await page.getByRole("button", { name: "Edit search-test.txt" }).click();

  const dialog = page.getByRole("dialog");
  const editor = dialog.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.fill("alpha beta alpha");
  await editor.press("Control+Home");
  await editor.press("Tab");
  await expect(editor).toContainText("\talpha beta alpha");
  await editor.press("Shift+Tab");
  await expect(editor).toContainText("alpha beta alpha");
  await editor.fill("alpha beta alpha");
  await editor.press("Control+Home");

  await page.keyboard.press("Control+f");
  const panel = dialog.locator(".cm-search");
  const search = panel.locator('input[name="search"]');
  const replace = panel.locator('input[name="replace"]');
  await expect(panel).toBeVisible();
  await expect(search).toBeFocused();
  await expect(panel.locator('button[name="next"]')).toBeVisible();
  await expect(panel.locator('button[name="prev"]')).toBeVisible();
  await expect(panel.locator('button[name="select"]')).toBeVisible();
  await expect(panel.locator('button[name="close"]')).toBeVisible();
  await expect(panel.locator("label")).toHaveCount(3);
  for (const option of ["case", "re", "word"]) {
    await expect(panel.locator(`input[name="${option}"]`)).toBeVisible();
  }
  await expect(replace).toBeVisible();
  await expect(panel.locator('button[name="replace"]')).toBeVisible();
  await expect(panel.locator('button[name="replaceAll"]')).toBeVisible();

  const originalViewport = page.viewportSize()!;
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await dialog.evaluate((element) => {
      const code = element.querySelector(".code-editor .cm-editor")!;
      const searchPanel = element.querySelector(".cm-search")!;
      const controls = Array.from(
        searchPanel.querySelectorAll(
          'input[name="search"], button[name="next"], button[name="prev"], button[name="select"], label, input[name="replace"], button[name="replace"], button[name="replaceAll"], button[name="close"]',
        ),
      );
      const rect = (node: Element) => {
        const { x, y, right, bottom, width, height } = node.getBoundingClientRect();
        return { x, y, right, bottom, width, height };
      };
      return {
        editor: rect(code),
        panel: rect(searchPanel),
        find: rect(searchPanel.querySelector('input[name="search"]')!),
        replace: rect(searchPanel.querySelector('input[name="replace"]')!),
        controls: controls.map(rect),
      };
    });
    expect(layout.panel.x).toBeGreaterThanOrEqual(layout.editor.x);
    expect(layout.panel.right).toBeLessThanOrEqual(layout.editor.right + 1);
    expect(layout.panel.y).toBeGreaterThanOrEqual(layout.editor.y);
    expect(layout.panel.bottom).toBeLessThanOrEqual(layout.editor.bottom + 1);
    expect(layout.panel.height).toBeLessThan(160);
    expect(layout.panel.height).toBeLessThan(layout.editor.height / 3);
    expect(layout.find.width).toBeLessThan(layout.editor.width * 0.75);
    expect(layout.replace.width).toBeLessThan(layout.editor.width * 0.75);
    for (let first = 0; first < layout.controls.length; first += 1) {
      for (let second = first + 1; second < layout.controls.length; second += 1) {
        const a = layout.controls[first];
        const b = layout.controls[second];
        expect(
          Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1,
        ).toBe(false);
      }
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize(originalViewport);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await search.fill("alpha");
  await panel.locator('button[name="next"]').click();
  await expect(dialog.locator(".editor-statusbar")).toContainText("Ln 1, Col 6");
  await panel.locator('button[name="next"]').click();
  await expect(dialog.locator(".editor-statusbar")).toContainText("Ln 1, Col 17");
  await panel.locator('button[name="prev"]').click();
  await expect(dialog.locator(".editor-statusbar")).toContainText("Ln 1, Col 6");
  await replace.fill("delta");
  await panel.locator('button[name="replace"]').click();
  await expect(editor).toContainText("delta beta alpha");
  await replace.fill("gamma");
  await panel.locator('button[name="replaceAll"]').click();
  await expect(editor).toContainText("delta beta gamma");

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(editor).toBeFocused();
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("alert")).toContainText(
    "Changes saved to local demo memory only",
  );
  await expect(dialog.locator(".editor-statusbar")).toContainText("Saved");

  await page.keyboard.press("Control+f");
  await expect(search).toBeFocused();
  await panel.locator('button[name="close"]').click();
  await expect(panel).toBeHidden();
  await editor.fill("make this dirty");
  await page.keyboard.press("Escape");
  const wrapToggle = dialog.getByRole("button", { name: "Toggle line wrapping" });
  await expect(wrapToggle).toBeFocused();
  await expect(wrapToggle).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Space");
  await expect(wrapToggle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(wrapToggle).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  const closeButton = dialog.getByRole("button", { name: "Close", exact: true });
  await expect(closeButton).toBeFocused();
  await page.keyboard.press("Tab");
  const saveButton = dialog.getByRole("button", { name: "Save", exact: true });
  await expect(saveButton).toBeFocused();
  await expect(saveButton).toHaveCSS("outline-style", "solid");
  await expect(saveButton).toHaveCSS("outline-color", "rgb(76, 187, 213)");
  page.once("dialog", (confirm) => void confirm.accept());
  await closeButton.click();
  await expect(dialog).toHaveCount(0);
});
