import { expect, test } from "@playwright/test";

const account = {
  id: "customer_1",
  display_name: "Alex Customer",
  email: "alex@example.test",
  email_verified: true,
  prealpha_access: true,
  role: "customer",
};

const project = {
  id: "project_1",
  name: "Portfolio",
  slug: "portfolio",
  status: "active",
};

function githubStatus(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    connected: false,
    repository: null,
    branch: null,
    source_folder: null,
    daily_sync: false,
    status: "disconnected",
    last_deployed_commit: null,
    last_check_at: null,
    last_success_at: null,
    failure_reason: null,
    ...overrides,
  };
}

async function signIn(page: import("@playwright/test").Page) {
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({
      status: 401,
      json: { success: false, error: "UNAUTHORIZED", code: 1002 },
    }),
  );
  await page.route("**/v1/auth/login", (route) =>
    route.fulfill({ json: { success: true, user: account } }),
  );
  await page.route("**/v1/projects", (route) =>
    route.fulfill({ json: { success: true, projects: [project] } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(account.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function openGitHubSync(page: import("@playwright/test").Page) {
  await page.getByRole("link", { name: /Websites/ }).click();
  await page
    .locator("main")
    .getByRole("link", { name: "Manage", exact: true })
    .click();
  await page
    .locator(".tabs")
    .getByRole("link", { name: "GitHub Sync", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "GitHub Sync", exact: true }),
  ).toBeVisible();
}

test("connect, configure, sync, disconnect, and fit Chromebook-sized screens", async ({
  page,
}) => {
  await signIn(page);
  let connection = githubStatus();
  const connectBodies: unknown[] = [];
  let disconnected = false;
  await page.route("**/v1/projects/project_1/github", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { success: true, github: connection } });
      return;
    }
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      connectBodies.push(body);
      connection = githubStatus({
        connected: true,
        repository: body.repository_url,
        branch: body.branch || "main",
        source_folder: body.source_folder || "",
        daily_sync: body.daily_sync,
        status: "connected",
      });
      await route.fulfill({ json: { success: true, github: connection } });
      return;
    }
    if (route.request().method() === "DELETE") {
      disconnected = true;
      connection = githubStatus();
      await route.fulfill({ json: { success: true, github: connection } });
      return;
    }
    await route.fulfill({ status: 405 });
  });
  await page.route(
    "**/v1/projects/project_1/github/sync",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      connection = githubStatus({
        ...connection,
        status: "success",
        last_deployed_commit:
          "0123456789abcdef0123456789abcdef01234567",
        last_check_at: 1794412800,
        last_success_at: 1794412800,
      });
      await route.fulfill({
        json: {
          success: true,
          sync: {
            status: "success",
            deployed_commit:
              "0123456789abcdef0123456789abcdef01234567",
            last_check_at: 1794412800,
            last_success_at: 1794412800,
          },
        },
      });
    },
  );

  await openGitHubSync(page);
  await expect(
    page.getByText("Editor and GitHub files can conflict."),
  ).toBeVisible();
  await page.getByLabel("Public repository").fill("not-a-repository");
  await page.getByRole("button", { name: "Connect repository" }).click();
  await expect(page.getByRole("alert")).toContainText("owner/repo");
  expect(connectBodies).toEqual([]);

  await page.getByLabel("Public repository").fill("acme/portfolio");
  await page.getByLabel("Branch name").fill("main");
  await page.getByLabel("Website source folder").fill("website");
  await page
    .getByLabel("Enable daily synchronization")
    .check();

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole("button", { name: "Connect repository" }).click();
  await expect(page.getByText("https://github.com/acme/portfolio")).toBeVisible();
  expect(connectBodies[0]).toEqual({
    repository_url: "https://github.com/acme/portfolio",
    branch: "main",
    source_folder: "website",
    daily_sync: true,
  });

  await page.getByLabel("Branch name").fill("release");
  await page.getByLabel("Website source folder").fill("public");
  await page.getByLabel("Enable daily synchronization").uncheck();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("release", { exact: true })).toBeVisible();
  expect(connectBodies[1]).toEqual({
    repository_url: "https://github.com/acme/portfolio",
    branch: "release",
    source_folder: "public",
    daily_sync: false,
  });

  await page.getByRole("button", { name: "Sync Now" }).click();
  await expect(
    page.getByRole("progressbar", {
      name: "GitHub synchronization in progress",
    }),
  ).toBeVisible();
  await expect(page.getByText("Last deployed commit")).toBeVisible();
  await expect(
    page.getByText("0123456789abcdef0123456789abcdef01234567"),
  ).toBeVisible();
  await expect(
    page
      .locator(".github-sync-details > div")
      .filter({ hasText: "Last synchronization" })
      .locator("dd"),
  ).toContainText(/(?:PST|PDT|UTC|GMT[+-]\d{1,2})/);

  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Disconnect GitHub repository?",
  });
  await dialog.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByLabel("Public repository")).toBeVisible();
  expect(disconnected).toBe(true);
});

test("shows the documented conflict error without exposing raw backend details", async ({
  page,
}) => {
  await signIn(page);
  let connection = githubStatus({
    connected: true,
    repository: "https://github.com/acme/portfolio",
    branch: "main",
    source_folder: "",
    daily_sync: false,
    status: "connected",
  });
  await page.route("**/v1/projects/project_1/github", (route) =>
    route.fulfill({ json: { success: true, github: connection } }),
  );
  await page.route(
    "**/v1/projects/project_1/github/sync",
    async (route) => {
      connection = githubStatus({
        connected: true,
        repository: "https://github.com/acme/portfolio",
        branch: "main",
        source_folder: "",
        daily_sync: false,
        status: "conflict",
        failure_reason: "SYNC_CONFLICT",
      });
      await route.fulfill({
        status: 409,
        json: {
          success: false,
          error: "GITHUB_SYNC_CONFLICT",
          code: 1005,
          message:
            "GitHub Sync found a file changed both in GitHub and the built-in editor. Resolve the file conflict before retrying.",
        },
      });
    },
  );
  await openGitHubSync(page);
  await page.getByRole("button", { name: "Sync Now" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Resolve the file conflict before retrying.",
  );
  await expect(page.getByText("Conflict detected")).toBeVisible();
  await expect(page.getByText("private backend details")).toHaveCount(0);
});
