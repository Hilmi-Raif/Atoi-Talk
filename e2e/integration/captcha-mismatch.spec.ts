import { expect, test } from "@playwright/test";

test("enabled backend rejects login from a captcha-disabled frontend", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("person@atoitalk.test");
  await page.getByLabel("Password", { exact: true }).fill("IntegrationPassword1!");
  const response = page.waitForResponse((response) => response.url().endsWith("/api/auth/login"));
  await page.getByRole("button", { name: "Login", exact: true }).click();
  const rejected = await response;
  expect(rejected.status()).toBe(400);
  expect(rejected.request().postDataJSON()).not.toHaveProperty("captcha_token");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('iframe[src*="challenges.cloudflare.com"]')).toHaveCount(0);
});
