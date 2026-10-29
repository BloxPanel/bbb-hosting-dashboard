import { expect, test } from "@playwright/test";
const account = {
  id: "customer_1",
  display_name: "Alex Customer",
  email: "alex@example.test",
  email_verified: true,
  role: "customer",
};
test.beforeEach(async ({ page }) => {
  await page.route("https://api.builtbybuzz.dev/**", (route) =>
    route.fulfill({ status: 401, json: { error: { code: "UNAUTHORIZED" } } }),
  );
});
test("session initialization, destination, login, account and logout", async ({
  page,
}) => {
  await page.goto("/dashboard/account");
  await expect(page).toHaveURL(/\/login$/);
  await page.route("**/v1/auth/login", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.route("**/v1/auth/logout", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route("**/v1/projects", (route) =>
    route.fulfill({ json: { projects: [] } }),
  );
  await page.getByLabel("Email address", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/account$/);
  await expect(page.getByLabel("Full name")).toHaveValue(account.display_name);
  await expect(page.getByText("Email verification: Verified")).toBeVisible();
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue(account.display_name);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});
test("registration validation, request and generic acknowledgment", async ({
  page,
}) => {
  let body: unknown;
  await page.route("**/v1/auth/register", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 202, json: { success: true } });
  });
  await page.goto("/register");
  await page.getByLabel("Display name").fill("Alex");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("New password", { exact: true }).fill("short");
  await page.getByLabel("Confirm password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert")).toContainText("12");
  expect(body).toBeUndefined();
  await page
    .getByLabel("New password", { exact: true })
    .fill("test-only-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert")).toContainText("match");
  await page.getByLabel("Confirm password").fill("test-only-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText(
    "If your address is eligible",
  );
  expect(body).toEqual({
    email: account.email,
    display_name: "Alex",
    password: "test-only-password",
  });
});
for (const path of ["verify-email", "reset-password"]) {
  test(
    path +
      " captures fragment, waits for action, handles invalid link and success",
    async ({ page, request }) => {
      const fallback = await (await request.get("/404.html")).text();
      await page.route("**/" + path + "*", async (route) => {
        if (route.request().isNavigationRequest())
          await route.fulfill({
            status: 404,
            contentType: "text/html",
            body: fallback,
          });
        else await route.continue();
      });
      let calls = 0;
      await page.route("**/v1/auth/" + path, async (route) => {
        calls++;
        expect(route.request().postDataJSON().token).toBe("test-secret");
        await route.fulfill(
          calls === 1
            ? { status: 400, json: { error: { code: "INVALID_TOKEN" } } }
            : { json: { success: true } },
        );
      });
      await page.goto("/" + path + "#token=test-secret");
      await expect(page).toHaveURL(new RegExp("/" + path + "$"));
      expect(calls).toBe(0);
      expect(
        await page.evaluate(() =>
          document
            .querySelector('meta[name="referrer"]')
            ?.getAttribute("content"),
        ),
      ).toBe("no-referrer");
      if (path === "reset-password") {
        await page
          .getByLabel("New password", { exact: true })
          .fill("test-only-password");
        await page.getByLabel("Confirm password").fill("test-only-password");
      }
      const button = page.getByRole("button", {
        name: path === "verify-email" ? "Verify email" : "Reset password",
        exact: true,
      });
      await button.click();
      await expect(page.getByRole("alert")).toContainText("invalid, expired");
      await button.click();
      await expect(page.getByRole("status")).toContainText(
        path === "verify-email" ? "Email verified" : "Password reset",
      );
      expect(
        await page.evaluate(() => [localStorage.length, sessionStorage.length]),
      ).toEqual([0, 0]);
      await page.reload();
      await expect(page.getByRole("alert")).toContainText("missing a token");
    },
  );
}
test("production isolates demo and recovery remains generic", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Enter demo workspace" }),
  ).toHaveCount(0);
  await page.route("**/v1/auth/forgot-password", (route) =>
    route.fulfill({ status: 202, json: { success: true } }),
  );
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill("unknown@example.test");
  await page.getByRole("button", { name: "Send reset instructions" }).click();
  await expect(page.getByRole("status")).toContainText(
    "If an eligible account exists",
  );
});

test("session expiration clears access after refresh", async ({ page }) => {
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.route("**/v1/projects", (route) =>
    route.fulfill({ json: { projects: [] } }),
  );
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Welcome back, Alex." }),
  ).toBeVisible();
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ status: 401, json: { error: { code: "UNAUTHORIZED" } } }),
  );
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("body")).not.toContainText("Alex Customer");
});

test("authenticated dashboard loads only the API-owned projects", async ({
  page,
}) => {
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.route("**/v1/projects", (route) =>
    route.fulfill({
      json: {
        projects: [
          {
            id: "project-from-api",
            name: "API Website",
            slug: "api-website",
            status: "active",
            created_at: "2026-10-12",
          },
        ],
      },
    }),
  );

  await page.goto("/dashboard/sites");
  await expect(page.getByText("API Website", { exact: true })).toBeVisible();
  await expect(page.getByText("api-website.builtbybuzz.dev")).toHaveAttribute(
    "href",
    "https://api-website.builtbybuzz.dev",
  );
  await expect(
    page.getByRole("table").getByText("Active", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toContainText("2026-10-12");
  await expect(page.locator("main")).not.toContainText("Studio North");
});

test("authenticated dashboard shows an empty state for no projects", async ({
  page,
}) => {
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.route("**/v1/projects", (route) =>
    route.fulfill({ json: { projects: [] } }),
  );

  await page.goto("/dashboard/sites");
  await expect(page.getByRole("heading", { name: "No websites yet" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Studio North");
});

test("project-list authentication failure returns to the sign-in flow", async ({
  page,
}) => {
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.route("**/v1/projects", (route) =>
    route.fulfill({ status: 401, json: { error: { code: "UNAUTHORIZED" } } }),
  );

  await page.goto("/dashboard/sites");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("body")).not.toContainText("API Website");
});

test("project-list API errors are visible and retryable", async ({ page }) => {
  let requests = 0;
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.route("**/v1/projects", (route) => {
    requests++;
    return route.fulfill(
      requests === 1
        ? { status: 503, json: { error: { message: "private details" } } }
        : {
            json: {
              projects: [
                {
                  id: "project-from-retry",
                  name: "Loaded After Retry",
                  slug: "retry-site",
                  status: "inactive",
                },
              ],
            },
          },
    );
  });

  await page.goto("/dashboard/sites");
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(page.locator("body")).not.toContainText("private details");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByText("Loaded After Retry", { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(2);
});

test("project-list loading state is displayed", async ({ page }) => {
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.route("**/v1/projects", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ json: { projects: [] } });
  });

  await page.goto("/dashboard/sites");
  await expect(page.getByRole("status")).toContainText("Loading your websites");
  await expect(page.getByRole("heading", { name: "No websites yet" })).toBeVisible();
});

test("creates a website and refreshes the API-owned project list", async ({
  page,
}) => {
  const projectList = [
    {
      id: "mcclain-case",
      name: "McClain Case",
      slug: "mcclain-case",
      status: "active",
    },
  ];
  let projectListRequests = 0;
  let createBody: unknown;
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.route("**/v1/projects", async (route) => {
    if (route.request().method() === "POST") {
      createBody = route.request().postDataJSON();
      projectList.push({
        id: "new-project",
        name: "My Awesome Website",
        slug: "my-awesome-website",
        status: "inactive",
      });
      await route.fulfill({
        status: 201,
        json: { project: projectList[1] },
      });
      return;
    }
    projectListRequests++;
    await route.fulfill({ json: { projects: projectList } });
  });

  await page.goto("/dashboard/sites");
  await expect(page.getByText("McClain Case", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create website" }).click();
  await page.getByLabel("Website name").fill("My Awesome Website");
  await expect(page.getByLabel("Subdomain")).toHaveValue(
    "my-awesome-website",
  );
  await expect(page.getByText("my-awesome-website.builtbybuzz.dev")).toBeVisible();
  await page.getByRole("button", { name: "Create website" }).last().click();

  await expect(
    page.getByText("My Awesome Website", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".count")).toHaveText("2");
  const newProjectRow = page
    .getByRole("row")
    .filter({ hasText: "My Awesome Website" });
  await expect(newProjectRow).toContainText("Inactive");
  await expect(
    page.getByRole("row").filter({ hasText: "McClain Case" }),
  ).toContainText("Active");
  expect(createBody).toEqual({
    name: "My Awesome Website",
    slug: "my-awesome-website",
  });
  expect(projectListRequests).toBe(2);
});

test("validates website name and subdomain before sending a request", async ({
  page,
}) => {
  let createRequests = 0;
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.route("**/v1/projects", async (route) => {
    if (route.request().method() === "POST") {
      createRequests++;
      await route.fulfill({ status: 201, json: {} });
    } else await route.fulfill({ json: { projects: [] } });
  });

  await page.goto("/dashboard/sites");
  await page.getByRole("button", { name: "Create website" }).click();
  await page.getByRole("button", { name: "Create website" }).last().click();
  await expect(page.getByRole("alert")).toContainText(
    "Enter a website name",
  );
  await page.getByLabel("Website name").fill("Website");
  await page.getByLabel("Subdomain").fill("has spaces");
  await page.getByRole("button", { name: "Create website" }).last().click();
  await expect(page.getByRole("alert")).toContainText(
    "Use 1–63 lowercase letters",
  );
  await page.getByLabel("Subdomain").fill("www");
  await page.getByRole("button", { name: "Create website" }).last().click();
  await expect(page.getByRole("alert")).toContainText("subdomain is reserved");
  expect(createRequests).toBe(0);
});

test("creation authorization failure returns to sign in", async ({ page }) => {
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.route("**/v1/projects", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 401, json: { error: { code: "UNAUTHORIZED" } } })
      : route.fulfill({ json: { projects: [] } }),
  );

  await page.goto("/dashboard/sites");
  await page.getByRole("button", { name: "Create website" }).click();
  await page.getByLabel("Website name").fill("Expired Session Website");
  await page.getByRole("button", { name: "Create website" }).last().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("body")).not.toContainText("Alex Customer");
});

test("blocks duplicate submissions while the create request is in flight", async ({
  page,
}) => {
  let createRequests = 0;
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.route("**/v1/projects", async (route) => {
    if (route.request().method() === "POST") {
      createRequests++;
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({ status: 201, json: {} });
    } else await route.fulfill({ json: { projects: [] } });
  });

  await page.goto("/dashboard/sites");
  await page.getByRole("button", { name: "Create website" }).click();
  await page.getByLabel("Website name").fill("Waiting Website");
  await page.getByRole("button", { name: "Create website" }).last().click();
  await expect(page.getByRole("button", { name: "Creating…" })).toBeDisabled();
  await expect(page.getByLabel("Website name")).toBeDisabled();
  await expect.poll(() => createRequests).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("shows a clear duplicate-subdomain error", async ({ page }) => {
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.route("**/v1/projects", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 409,
          json: { error: { code: "SLUG_TAKEN" } },
        })
      : route.fulfill({ json: { projects: [] } }),
  );

  await page.goto("/dashboard/sites");
  await page.getByRole("button", { name: "Create website" }).click();
  await page.getByLabel("Website name").fill("Taken Website");
  await page.getByRole("button", { name: "Create website" }).last().click();
  await expect(page.getByRole("alert")).toContainText(
    "That subdomain is already in use",
  );
});

test("asks unverified users to verify their email before creating a website", async ({
  page,
}) => {
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.route("**/v1/projects", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 403,
          json: {
            error: {
              code: "EMAIL_NOT_VERIFIED",
              message: "private account details",
            },
          },
        })
      : route.fulfill({ json: { projects: [] } }),
  );

  await page.goto("/dashboard/sites");
  await page.getByRole("button", { name: "Create website" }).click();
  await page.getByLabel("Website name").fill("Unverified Website");
  await page.getByRole("button", { name: "Create website" }).last().click();
  await expect(page.getByRole("alert")).toContainText(
    "verify your email address",
  );
  await expect(page.locator("body")).not.toContainText(
    "private account details",
  );
});

test("shows a sanitized message when project creation fails on the server", async ({
  page,
}) => {
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.route("**/v1/projects", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          json: { error: { message: "private infrastructure details" } },
        })
      : route.fulfill({ json: { projects: [] } }),
  );

  await page.goto("/dashboard/sites");
  await page.getByRole("button", { name: "Create website" }).click();
  await page.getByLabel("Website name").fill("Retry Website");
  await page.getByRole("button", { name: "Create website" }).last().click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(page.locator("body")).not.toContainText(
    "private infrastructure details",
  );
});

test("Pages fallback supports every public auth route and dashboard", async ({
  page,
  request,
}) => {
  const html = await (await request.get("/404.html")).text();
  expect(html).toBe(await (await request.get("/")).text());
  await page.route("http://127.0.0.1:4174/**", (route) =>
    route.request().isNavigationRequest()
      ? route.fulfill({ status: 404, contentType: "text/html", body: html })
      : route.continue(),
  );
  for (const path of [
    "register",
    "login",
    "verify-email",
    "forgot-password",
    "reset-password",
    "dashboard",
  ]) {
    await page.goto("/" + path);
    await expect(page.locator("form")).toBeVisible();
    await page.reload();
    await expect(page.locator("form")).toBeVisible();
  }
});

test("login errors are understandable and repeated submission is blocked", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/v1/auth/login", async (route) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({
      status: 429,
      json: { error: { code: "RATE_LIMITED", message: "private details" } },
    });
  });
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  const button = page.getByRole("button", { name: "Sign in", exact: true });
  await button.click();
  await expect(
    page.getByRole("button", { name: "Please wait" }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Too many attempts");
  expect(calls).toBe(1);
  await expect(page.locator("body")).not.toContainText("private details");
});
