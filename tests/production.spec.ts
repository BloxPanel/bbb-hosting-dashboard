import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
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
  await expect(page.getByRole("link", { name: "Open website" })).toHaveAttribute(
    "href",
    "https://api-website.builtbybuzz.dev",
  );
  await expect(
    page.getByRole("table").getByText("Active", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toContainText("2026-10-12");
  await expect(page.locator("main")).not.toContainText("Studio North");
});

test("project file manager lists, uploads, replaces and deletes with browser sessions", async ({
  page,
}) => {
  const project = {
    id: "project-files",
    name: "File Test Website",
    slug: "file-test-website",
    status: "inactive",
  };
  await page.route("**/v1/auth/me", (route) =>
    route.fulfill({ json: { user: account } }),
  );
  await page.route("**/v1/projects", (route) =>
    route.fulfill({ json: { projects: [project] } }),
  );
  let entries = [
    {
      path: "index.html",
      size: 12,
      content_type: "text/html; charset=utf-8",
      updated_at: "2026-10-29T12:00:00.000Z",
    },
    {
      path: "assets/site.css",
      size: 23,
      content_type: "text/css; charset=utf-8",
      updated_at: "2026-10-29T12:00:00.000Z",
    },
    {
      path: "archive/notes.txt",
      size: 11,
      content_type: "text/plain; charset=utf-8",
      updated_at: "2026-10-29T12:00:00.000Z",
    },
  ];
  const mutations: Array<{ method: string; path: string; bodyLength: number }> = [];
  await page.route("**/v1/projects/project-files/files**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:4174",
      "access-control-allow-credentials": "true",
      vary: "Origin",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          ...headers,
          "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
      return;
    }
    if (request.method() === "GET" && url.pathname.endsWith("/files")) {
      const page = url.searchParams.has("cursor") ? entries.slice(2) : entries.slice(0, 2);
      await route.fulfill({
        json: {
          success: true,
          files: page,
          next_cursor: url.searchParams.has("cursor") ? null : "page-2",
        },
        headers,
      });
      return;
    }
    const path =
      url.searchParams.get("path") ||
      decodeURIComponent(url.pathname.split("/files/")[1] || "");
    if (request.method() === "GET") {
      await route.fulfill({
        body: "<h1>Private preview</h1>",
        headers: { ...headers, "content-type": "text/html; charset=utf-8" },
      });
      return;
    }
    const body = request.postDataBuffer();
    mutations.push({
      method: request.method(),
      path,
      bodyLength: body?.byteLength ?? 0,
    });
    if (request.method() === "POST" && path === "upload-error.html") {
      await route.fulfill({
        status: 411,
        json: { success: false, error: "CONTENT_LENGTH_REQUIRED" },
        headers,
      });
      return;
    }
    if (request.method() === "POST" && path === "new.html")
      await new Promise((resolve) => setTimeout(resolve, 250));
    if (request.method() === "DELETE") {
      entries = entries.filter((entry) => entry.path !== path);
      await route.fulfill({
        json: { success: true, deleted: path },
        headers,
      });
      return;
    }
    const uploaded = {
      path,
      size: body?.byteLength ?? 0,
      content_type: "text/html; charset=utf-8",
      updated_at: "2026-10-29T12:30:00.000Z",
    };
    const index = entries.findIndex((entry) => entry.path === path);
    if (request.method() === "PUT") {
      if (index >= 0) entries[index] = uploaded;
    } else {
      entries.push(uploaded);
    }
    await route.fulfill({
      status: request.method() === "PUT" ? 200 : 201,
      json: { success: true, file: { path, size: uploaded.size, content_type: uploaded.content_type } },
      headers,
    });
  });
  await page.route("**/v1/projects/project-files/storage", (route) =>
    route.fulfill({
      json: {
        success: true,
        storage: {
          bytes_used: entries.reduce((sum, entry) => sum + entry.size, 0),
          file_count: entries.length,
          file_count_limit: 10_000,
          quota_bytes: 1024 * 1024 * 1024,
          percent_used: 0,
        },
      },
    }),
  );

  await page.goto("/dashboard/sites");
  await page.getByRole("link", { name: "Manage", exact: true }).click();
  await page
    .locator(".tabs")
    .getByRole("link", { name: "Files", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "index.html", exact: true })).toBeVisible();
  await expect(page.getByLabel("Storage usage")).toContainText("3 / 10,000 files");
  await page.getByRole("button", { name: "Preview index.html" }).click();
  await expect(page.getByRole("dialog")).toContainText("Private preview");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open folder assets" }).click();
  await expect(page.getByRole("button", { name: "site.css", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Root", exact: true }).click();
  await page.getByRole("button", { name: "Load more files" }).click();
  await expect(page.getByRole("button", { name: "Open folder archive" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "new.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h1>New</h1>"),
  });
  await expect(page.getByRole("status")).toContainText("Uploading new.html");
  await page.getByRole("button", { name: "Load more files" }).click();
  await expect(page.getByRole("button", { name: "new.html", exact: true })).toBeVisible();
  expect(mutations[0]).toMatchObject({
    method: "POST",
    path: "new.html",
    bodyLength: Buffer.byteLength("<h1>New</h1>"),
  });

  await page.getByRole("button", { name: "Replace index.html" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "replacement.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h1>Updated</h1>"),
  });
  await expect(page.getByText("File replaced.", { exact: false })).toBeVisible();
  expect(mutations[1]).toMatchObject({
    method: "PUT",
    path: "index.html",
    bodyLength: Buffer.byteLength("<h1>Updated</h1>"),
  });

  await page.getByRole("button", { name: "Load more files" }).click();
  await page.getByRole("button", { name: "Delete new.html" }).click();
  await expect(page.getByRole("dialog")).toContainText("Delete new.html?");
  await page.getByRole("button", { name: "Delete file", exact: true }).click();
  await page.getByRole("button", { name: "Load more files" }).click();
  await expect(page.getByRole("button", { name: "new.html", exact: true })).toHaveCount(0);
  expect(mutations[2]).toMatchObject({
    method: "DELETE",
    path: "new.html",
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "upload-error.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h1>Retry</h1>"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "browser cannot set Content-Length manually",
  );
  await page.locator(".dropzone").evaluate((dropzone) => {
    const data = new DataTransfer();
    data.items.add(
      new File(["<h1>Dropped</h1>"], "dragged.html", { type: "text/html" }),
    );
    dropzone.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: data,
      }),
    );
  });
  await expect(page.getByRole("alert")).toContainText("Upload complete");
  expect(mutations[4]).toMatchObject({
    method: "POST",
    path: "dragged.html",
  });
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test("Chromium supplies Content-Length for a browser-native File upload", async ({
  page,
}) => {
  let receivedLength: string | undefined;
  let receivedBytes = 0;
  const server = createServer((request, response) => {
    const origin = request.headers.origin || "";
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "content-type");
    response.setHeader("Vary", "Origin");
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    receivedLength = request.headers["content-length"];
    request.on("data", (chunk: Buffer) => {
      receivedBytes += chunk.byteLength;
    });
    request.on("end", () => {
      response.writeHead(201, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ success: true }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("The browser upload test server did not start.");
    await page.goto("/login");
    const expectedBytes = Buffer.byteLength("<h1>Browser upload</h1>");
    const result = await page.evaluate(async (url) => {
      const file = new File(["<h1>Browser upload</h1>"], "browser.html", {
        type: "text/html",
      });
      return await new Promise<{ status: number; progress: number }>(
        (resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open("POST", url);
          request.withCredentials = true;
          let progress = 0;
          request.upload.onprogress = (event) => {
            if (event.lengthComputable)
              progress = Math.round((event.loaded / event.total) * 100);
          };
          request.onload = () => resolve({ status: request.status, progress });
          request.onerror = () => reject(new Error("XHR upload failed"));
          request.send(file);
        },
      );
    }, `http://127.0.0.1:${address.port}/upload`);
    expect(result.status).toBe(201);
    expect(result.progress).toBe(100);
    expect(receivedLength).toBe(String(expectedBytes));
    expect(receivedBytes).toBe(expectedBytes);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("file API errors are visible and expired file sessions return to login", async ({
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
            id: "project-error",
            name: "Error Website",
            slug: "error-website",
            status: "inactive",
          },
        ],
      },
    }),
  );
  await page.route("**/v1/projects/project-error/files?*", (route) =>
    route.fulfill({
      status: 403,
      json: { success: false, error: "FORBIDDEN" },
    }),
  );
  await page.route("**/v1/projects/project-error/storage", (route) =>
    route.fulfill({
      json: {
        success: true,
        storage: {
          bytes_used: 0,
          file_count: 0,
          file_count_limit: 10_000,
          quota_bytes: 1024 * 1024 * 1024,
          percent_used: 0,
        },
      },
    }),
  );
  await page.goto("/dashboard/sites");
  await page.getByRole("link", { name: "Manage", exact: true }).click();
  await page
    .locator(".tabs")
    .getByRole("link", { name: "Files", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("permission");

  await page.unroute("**/v1/projects/project-error/files?*");
  await page.route("**/v1/projects/project-error/files?*", (route) =>
    route.fulfill({
      status: 401,
      json: { success: false, error: "UNAUTHORIZED" },
    }),
  );
  await page.getByRole("button", { name: "Refresh file list" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email address")).toBeVisible();
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
