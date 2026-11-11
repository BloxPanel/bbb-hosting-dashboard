import { expect, test } from "@playwright/test";

const account = {
  id: "tester-1",
  display_name: "Test User",
  email: "tester@example.test",
  email_verified: true,
  prealpha_access: false,
  role: "customer",
};

test.beforeEach(async ({ page }) => {
  await page.route("https://api.builtbybuzz.dev/**", (route) =>
    route.fulfill({ status: 401, json: { error: { code: "UNAUTHORIZED" } } }),
  );
});

test("registration email mismatch is safely reported without exposing invite data", async ({
  page,
}) => {
  const token = "d".repeat(64);
  await page.route("**/v1/invitations/validate", (route) =>
    route.fulfill({ json: { success: true, valid: true } }),
  );
  await page.route("**/v1/auth/register", (route) =>
    route.fulfill({
      status: 403,
      json: {
        success: false,
        error: "INVITATION_EMAIL_MISMATCH",
        code: 6006,
        message: "This invitation cannot be used with this account.",
      },
    }),
  );
  await page.goto(`/invite#token=${token}`);
  await page.getByRole("link", { name: /Continue to create/ }).click();
  await page.getByLabel("Display name").fill("Test User");
  await page.getByLabel("Email address").fill("different@example.test");
  await page.getByLabel("New password", { exact: true }).fill("test-only-password");
  await page.getByLabel("Confirm password").fill("test-only-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "This invitation cannot be used with this account.",
  );
  await expect(page.locator("body")).not.toContainText(token);
  await expect(page).toHaveURL(/\/register$/);
});

test("an unverified signed-in account does not attempt invitation redemption", async ({
  page,
}) => {
  const unverifiedAccount = { ...account, email_verified: false };
  await page.route("**/v1/auth/login", (route) =>
    route.fulfill({ json: { success: true, user: unverifiedAccount } }),
  );
  let redeemRequests = 0;
  await page.route("**/v1/invitations/redeem", (route) => {
    redeemRequests++;
    return route.fulfill({ json: { success: true, access: "approved" } });
  });
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/access-restricted$/);
  await expect(page.getByText(/Verify your email/)).toBeVisible();
  expect(redeemRequests).toBe(0);
});

test("revoked access in an existing session is refreshed and returned to the restricted page", async ({
  page,
}) => {
  let sessionCalls = 0;
  await page.route("**/v1/auth/me", (route) => {
    sessionCalls++;
    return route.fulfill({
      json: {
        success: true,
        user: { ...account, prealpha_access: sessionCalls === 1 },
      },
    });
  });
  await page.route("**/v1/projects", (route) =>
    route.fulfill({
      status: 403,
      json: {
        success: false,
        error: "PREALPHA_ACCESS_DENIED",
        code: 6007,
        message: "This account does not have pre-alpha access.",
      },
    }),
  );
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/access-restricted$/);
  expect(sessionCalls).toBeGreaterThanOrEqual(2);
});

test("invitation and restricted pages remain usable at mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/v1/invitations/validate", (route) =>
    route.fulfill({ json: { success: true, valid: true } }),
  );
  await page.goto(`/invite#token=${"e".repeat(64)}`);
  await expect(page.getByRole("heading", { name: "You’re invited." })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.goto("/access-restricted");
  await expect(
    page.getByRole("heading", { name: "Access is currently restricted." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("the public root presents the closed pre-alpha access page", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/access-restricted$/);
  await expect(
    page.getByRole("heading", { name: "Access is currently restricted." }),
  ).toBeVisible();
});
