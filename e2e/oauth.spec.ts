import { currentUser, expect, test } from "./fixtures";

test("google redirect and callback exchange establish a persistent session", async ({ page }) => {
  const exchanges: unknown[] = [];
  await page.routeWebSocket("**/ws?*", () => {});
  await page.route("**/api/auth/google/init", (route) =>
    route.fulfill({
      json: {
        data: {
          auth_url:
            "http://127.0.0.1:4173/auth/google/callback?code=provider-code&state=provider-state",
          state: "provider-state",
          expires_in: 300,
        },
      },
    })
  );
  await page.route("**/api/auth/google", async (route) => {
    exchanges.push(route.request().postDataJSON());
    await route.fulfill({ json: { data: { token: "oauth-session", user: currentUser } } });
  });
  await page.route("**/api/user/current", (route) =>
    route.fulfill({ json: { data: currentUser } })
  );
  await page.route("**/api/chats*", (route) =>
    route.fulfill({ json: { data: [], meta: { has_next: false } } })
  );
  await page.goto("/login");
  await page.getByRole("button", { name: /Login with Google/i }).click();
  await expect(page).toHaveURL(/\/chat$/);
  expect(exchanges).toEqual([{ code: "provider-code", state: "provider-state" }]);
  await page.reload();
  await expect(page).toHaveURL(/\/chat$/);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("auth-storage")!).state.token)
  ).toBe("oauth-session");
  expect(exchanges).toHaveLength(1);
});

test.describe("google callback rejection", () => {
  for (const query of [
    "error=access_denied",
    "code=code-without-state",
    "state=state-without-code",
  ]) {
    test(`does not exchange incomplete or cancelled authorization ${query}`, async ({ page }) => {
      const exchanges: string[] = [];
      await page.route("**/api/auth/google", (route) => {
        exchanges.push(route.request().url());
        return route.fulfill({ status: 500, json: { error: "unexpected exchange" } });
      });
      await page.goto(`/auth/google/callback?${query}`);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible();
      expect(exchanges).toEqual([]);
      expect(await page.evaluate(() => localStorage.getItem("auth-storage"))).not.toContain(
        "oauth-session"
      );
    });
  }
  test("a rejected state leaves the login form usable without storing credentials", async ({
    page,
  }) => {
    await page.route("**/api/auth/google", (route) =>
      route.fulfill({ status: 400, json: { error: "Invalid OAuth state" } })
    );
    await page.goto("/auth/google/callback?code=provider-code&state=expired-state");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Invalid OAuth state", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeEditable();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("auth-storage") || "{}").state?.token
      )
    ).toBeFalsy();
  });
});
