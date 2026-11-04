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
    await expect(dialog.getByLabel("Editor contents")).toBeVisible();
    await expect(dialog.locator(".cm-gutterElement:visible").first()).toBeVisible();
      if (name === "index.html")
        await expect(dialog.locator(".cm-line span").first()).toBeVisible();
      await dialog.locator(".cm-content").fill(content);
    await expect(dialog).toContainText("Unsaved changes");
    await page.keyboard.press("Control+f");
    await expect(dialog.locator(".cm-search")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+s");
    await expect(page.getByRole("alert")).toContainText(
      "Changes saved to local demo memory only",
    );
    await expect(dialog).not.toContainText("Unsaved changes");
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
