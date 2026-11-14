import { test as base, expect } from "@playwright/test";

export const currentUser = {
  id: "u1",
  email: "person@example.com",
  full_name: "Test Person",
  username: "person",
  avatar: null,
  bio: null,
  has_password: true,
  role: "user",
};

// this token is only valid for mocked requests
const turnstileScript = `
  (() => {
    let sequence = 0;
    const widgets = new Map();
    const verify = (id) => queueMicrotask(() => widgets.get(id)?.callback?.('e2e-captcha-token'));
    window.turnstile = {
      ready: (callback) => callback(),
      render: (_container, options) => {
        const id = String(++sequence);
        widgets.set(id, options);
        if (options.execution !== 'execute') verify(id);
        return id;
      },
      reset: (id) => verify(id),
      execute: (id) => verify(id),
      remove: (id) => widgets.delete(id),
      getResponse: () => 'e2e-captcha-token',
      isExpired: () => false,
    };
    const callback = new URL(document.currentScript.src).searchParams.get('onload');
    if (callback) window[callback]?.();
  })();
`;

export const test = base.extend<{ isolatedApp: void; returningUser: boolean }>({
  returningUser: [true, { option: true }],
  isolatedApp: [
    async ({ page, returningUser }, use) => {
      if (returningUser) {
        await page.addInitScript(() => {
          localStorage.setItem("atoitalk:onboarding:u1", "seen");
        });
      }
      await page.route("https://challenges.cloudflare.com/**", (route) =>
        route.fulfill({ contentType: "application/javascript", body: turnstileScript })
      );
      // reject requests without a test handler
      await page.route("**/api/**", (route) =>
        route.fulfill({
          status: 501,
          json: {
            error: `Unhandled E2E API: ${route.request().method()} ${new URL(route.request().url()).pathname}`,
          },
        })
      );
      await use();
    },
    { auto: true },
  ],
});
export { expect };
