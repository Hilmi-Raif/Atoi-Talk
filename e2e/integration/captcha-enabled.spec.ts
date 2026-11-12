import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:18080";

test("enabled backend rejects an omitted captcha even when the client does not supply it", async ({
  request,
}) => {
  const response = await request.post(`${api}/api/otp/send`, {
    data: { email: `missing${Date.now()}@atoitalk.test`, mode: "register" },
  });
  expect(response.status()).toBe(400);
});

test("enabled backend verifies the official test token", async ({ request }) => {
  const response = await request.post(`${api}/api/otp/send`, {
    data: {
      email: `verified${Date.now()}@atoitalk.test`,
      mode: "register",
      captcha_token: "1x00000000000000000000AA",
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
});

test("enabled frontend mounts turnstile and releases the login form after verification", async ({
  page,
}) => {
  await page.goto("/login");
  await expect
    .poll(() =>
      page.frames().some((frame) => frame.url().startsWith("https://challenges.cloudflare.com/"))
    )
    .toBe(true);
  await page.getByLabel("Email", { exact: true }).fill("unknown@atoitalk.test");
  await page.getByLabel("Password", { exact: true }).fill("IntegrationPassword1!");
  await expect(page.getByRole("button", { name: "Login", exact: true })).toBeEnabled({
    timeout: 30000,
  });
});
