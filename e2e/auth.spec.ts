import { currentUser, expect, test } from "./fixtures";

test("AUTH-10 requests a registration OTP and creates an authenticated account", async ({
  page,
}) => {
  await page.routeWebSocket("**/ws?*", () => {});
  await page.route("**/api/otp/send", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: currentUser.email,
      mode: "register",
      captcha_token: "e2e-captcha-token",
    });
    await route.fulfill({ status: 204 });
  });
  await page.route("**/api/auth/register", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: currentUser.email,
      username: "newperson",
      full_name: "New Person",
      password: "Strong!123",
      code: "123456",
      captcha_token: "e2e-captcha-token",
    });
    await route.fulfill({ json: { data: { token: "registration-jwt", user: currentUser } } });
  });
  await page.route("**/api/user/current", (route) =>
    route.fulfill({ json: { data: currentUser } })
  );
  await page.route("**/api/chats?*", (route) =>
    route.fulfill({ json: { data: [], meta: { has_next: false } } })
  );
  await page.goto("/register");
  await page.getByPlaceholder("Email", { exact: true }).fill(currentUser.email);
  await page.getByRole("button", { name: /Request OTP/i }).click();
  await expect(page.getByText("OTP sent to your email", { exact: true })).toBeVisible();
  await page.getByPlaceholder("OTP Code").fill("123456");
  await page.getByLabel("Username", { exact: true }).fill("NewPerson");
  await page.getByLabel("Full Name", { exact: true }).fill("New Person");
  await page.getByLabel("Password", { exact: true }).fill("Strong!123");
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByText("No chats found.", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("auth-storage")!).state.token)
  ).toBe("registration-jwt");
});

test("AUTH-08 successful login opens the chat list and persists the session", async ({ page }) => {
  await page.routeWebSocket("**/ws?*", () => {});
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ json: { data: { token: "e2e-jwt", user: currentUser } } })
  );
  await page.route("**/api/user/current", (route) =>
    route.fulfill({ json: { data: currentUser } })
  );
  await page.route("**/api/chats?*", (route) =>
    route.fulfill({ json: { data: [], meta: { has_next: false, next_cursor: "" } } })
  );
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(currentUser.email);
  await page.getByLabel("Password", { exact: true }).fill("Strong!123");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByText("No chats found.", { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("auth-storage")!).state);
  expect(saved).toMatchObject({ token: "e2e-jwt", user: currentUser, isAuthenticated: true });
  await page.reload();
  await expect(page.getByText("No chats found.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/chat$/);
});

test("AUTH-09 password reset submits matching passwords and returns to login", async ({ page }) => {
  await page.route("**/api/auth/reset-password", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: currentUser.email,
      code: "123456",
      password: "Strong!123",
      confirm_password: "Strong!123",
      captcha_token: "e2e-captcha-token",
    });
    await route.fulfill({ status: 204 });
  });
  await page.goto("/forgot?email=person%40example.com&code=123456");
  await page.getByPlaceholder("New Password", { exact: true }).fill("Strong!123");
  await page.getByPlaceholder("Confirm Password", { exact: true }).fill("Strong!123");
  await page.getByRole("button", { name: "Reset Password", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Password reset successfully")).toBeVisible();
});

test("AUTH-01 guest cannot open a private chat", async ({ page }) => {
  await page.goto("/chat/private-chat");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Please login to continue.")).toBeVisible();
});

test("AUTH-02 login rejects malformed email without an API request", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/login")) requests.push(request.url());
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("not-an-email");
  await page.getByLabel("Password", { exact: true }).fill("Strong!123");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByText(/valid email/i)).toBeVisible();
  expect(requests).toEqual([]);
});

test("AUTH-03 invalid credentials stay on login and hide backend detail", async ({ page }) => {
  await page.route("**/api/auth/login", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: "person@example.com",
      password: "Strong!123",
      captcha_token: "e2e-captcha-token",
    });
    await route.fulfill({ status: 401, json: { error: "Internal user record missing" } });
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("person@example.com");
  await page.getByLabel("Password", { exact: true }).fill("Strong!123");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByText("Invalid email or password", { exact: true })).toBeVisible();
  await expect(page.getByText("Internal user record missing")).toHaveCount(0);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Login", exact: true })).toBeEnabled();
});

test("AUTH-04 login strips email whitespace before sending", async ({ page }) => {
  const requestPromise = page.waitForRequest("**/api/auth/login");
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ status: 401, json: { error: "Denied" } })
  );
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(" person @example.com ");
  await page.getByLabel("Password", { exact: true }).fill("Strong!123");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  expect((await requestPromise).postDataJSON().email).toBe("person@example.com");
});

test("AUTH-05 register and password recovery are reachable from login", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByPlaceholder("Email", { exact: true })).toBeVisible();
  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await expect(page).toHaveURL(/\/forgot$/);
  await expect(page.getByText("Create a new password for your account.")).toBeVisible();
});

test("AUTH-06 reset link prefills email and numeric OTP", async ({ page }) => {
  await page.goto("/forgot?email=person%40example.com&code=123456");
  await expect(page.getByPlaceholder("Email", { exact: true })).toHaveValue("person@example.com");
  await expect(page.getByPlaceholder("OTP Code")).toHaveValue("123456");
  await page.getByPlaceholder("OTP Code").fill("12ab34567");
  await expect(page.getByPlaceholder("OTP Code")).toHaveValue("1234");
});

test("AUTH-07 Google initialization failure leaves a usable login form", async ({ page }) => {
  await page.route("**/api/auth/google/init", (route) =>
    route.fulfill({ status: 503, json: { error: "Google sign-in unavailable" } })
  );
  await page.goto("/login");
  await page.getByRole("button", { name: "Login with Google" }).click();
  await expect(page.getByText("Google sign-in unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Login with Google" })).toBeEnabled();
  await expect(page).toHaveURL(/\/login$/);
});
