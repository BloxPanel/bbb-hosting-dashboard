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
  await page.locator("input[type=file]").setInputFiles({
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Demo file contents"),
  });
  await expect(
    page.getByRole("button", { name: "hello.txt", exact: true }),
  ).toBeVisible();
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
