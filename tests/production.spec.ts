import { expect, test } from "@playwright/test";

test("Pages 404 fallback preserves public deep links and refreshes", async ({
  page,
  request,
}) => {
  const fallback = await request.get("/404.html");
  expect(fallback.ok()).toBe(true);
  const html = await fallback.text();
  expect(html).toBe(await (await request.get("/")).text());
  // Vite preview has its own SPA rewrite. Override navigation responses to
  // reproduce Pages serving our built fallback with an HTTP 404 status.
  await page.route("**/*", async (route) => {
    if (route.request().isNavigationRequest()) {
      await route.fulfill({
        status: 404,
        contentType: "text/html",
        body: html,
      });
    } else {
      await route.continue();
    }
  });
  const path = "/signup?from=pages%2Ftest&next=files#account";
  expect((await page.goto(path))?.status()).toBe(404);
  await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(`http://127.0.0.1:4174${path}`);
  expect((await page.reload())?.status()).toBe(404);
  await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(`http://127.0.0.1:4174${path}`);
  await page.goto("/dashboard/sites/site_001/files?view=list#uploads");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
});

test("production denies demo access even when built with the demo flag", async ({
  page,
}) => {
  await page.goto("/dashboard/sites/site_001/files");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("button", { name: "Enter demo workspace" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("body")).not.toContainText("Studio North");
});

test("login fields and sign-up navigation work without inventing auth requests", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "fetch") requests.push(request.url());
  });
  await page.goto("/login");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("person@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("a-private-test-password");
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
    "person@example.com",
  );
  await page.getByRole("link", { name: "Sign up", exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await page.getByLabel("Full name", { exact: true }).fill("Example Person");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("person@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("a-private-test-password");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("a-private-test-password");
  await expect(
    page.getByRole("button", { name: "Create account", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Enter demo workspace" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(requests).toEqual([]);
});
test("health display uses the exclusive API origin and real response shape", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("https://api.builtbybuzz.dev/**", async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      json: {
        success: true,
        service: "bbb-hosting-api",
        status: "operational",
      },
    });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Check API health" }).click();
  await expect(page.getByRole("status")).toContainText("operational");
  expect(requests).toEqual(["https://api.builtbybuzz.dev/v1/health"]);
});
test("connectivity failures show actionable errors", async ({ page }) => {
  await page.route("https://api.builtbybuzz.dev/**", (route) => route.abort());
  await page.goto("/login");
  await page.getByRole("button", { name: "Check API health" }).click();
  await expect(page.getByRole("alert")).toContainText("CORS");
});
