import { currentUser, expect, test } from "./fixtures";

const partner = { ...currentUser, id: "u2", full_name: "Chat Partner", username: "partner" };
const chatId = "11111111-1111-4111-8111-111111111111";
const message = {
  id: "m1",
  chat_id: chatId,
  sender_id: partner.id,
  sender_name: partner.full_name,
  content: "Hello from your partner",
  type: "text",
  created_at: "2026-11-11T10:00:00Z",
  attachments: [],
  reply_to: null,
};
const chat = {
  id: chatId,
  type: "private",
  name: partner.full_name,
  avatar: null,
  unread_count: 0,
  last_read_at: null,
  other_last_read_at: null,
  other_user_id: partner.id,
  last_message: message,
  member_count: 2,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (user) =>
      localStorage.setItem(
        "auth-storage",
        JSON.stringify({ state: { token: "e2e-jwt", user, isAuthenticated: true }, version: 0 })
      ),
    currentUser
  );
  await page.routeWebSocket("**/ws?*", () => {});
  await page.route("**/api/user/current", (route) =>
    route.fulfill({ json: { data: currentUser } })
  );
  await page.route("**/api/users/u2", (route) => route.fulfill({ json: { data: partner } }));
  await page.route("**/api/chats?*", (route) =>
    route.fulfill({ json: { data: [chat], meta: { has_next: false } } })
  );
  await page.route(`**/api/chats/${chatId}`, (route) => route.fulfill({ json: { data: chat } }));
  await page.route(`**/api/chats/${chatId}/read`, (route) => route.fulfill({ status: 204 }));
  await page.route(`**/api/chats/${chatId}/messages?*`, (route) =>
    route.fulfill({ json: { data: [message], meta: { has_next: false, has_prev: false } } })
  );
});

test("CHAT-01 opens private history from a direct link", async ({ page }) => {
  await page.goto(`/chat/${chatId}`);
  await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
  await expect(page.getByText(message.content, { exact: true }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
});

test("CHAT-02 sends text and renders the returned message", async ({ page }) => {
  await page.route("**/api/messages", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      chat_id: chat.id,
      content: "A new browser message",
      type: "text",
    });
    await route.fulfill({
      json: {
        data: {
          ...message,
          id: "m2",
          sender_id: currentUser.id,
          sender_name: currentUser.full_name,
          content: "A new browser message",
        },
      },
    });
  });
  await page.goto(`/chat/${chatId}`);
  const composer = page.getByPlaceholder("Type a message...");
  await composer.fill("A new browser message");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(composer).toHaveValue("");
  await expect(page.getByText("A new browser message", { exact: true }).last()).toBeVisible();
});

test("CHAT-03 keeps an unsent draft when the API rejects a message", async ({ page }) => {
  await page.route("**/api/messages", (route) =>
    route.fulfill({ status: 403, json: { error: "Sending is not allowed" } })
  );
  await page.goto(`/chat/${chatId}`);
  const composer = page.getByPlaceholder("Type a message...");
  await composer.fill("Keep this draft");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(composer).toHaveValue("Keep this draft");
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeEnabled();
});

test("CHAT-04 receives a live message once when the server repeats its event", async ({ page }) => {
  let socket: import("@playwright/test").WebSocketRoute | undefined;
  await page.routeWebSocket("**/ws?*", (connected) => {
    socket = connected;
  });
  await page.goto(`/chat/${chatId}`);
  await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
  await expect.poll(() => Boolean(socket)).toBe(true);
  const liveMessage = { ...message, id: "live-1", content: "Arrived through the live socket" };
  socket!.send(JSON.stringify({ type: "message.new", payload: liveMessage }));
  await expect(page.getByText(liveMessage.content, { exact: true }).last()).toBeVisible();
  socket!.send(JSON.stringify({ type: "message.new", payload: liveMessage }));
  // wait for a later event before checking duplicate delivery
  socket!.send(
    JSON.stringify({
      type: "message.new",
      payload: { ...liveMessage, id: "live-2", content: "Socket delivery barrier" },
    })
  );
  await expect(page.getByText("Socket delivery barrier", { exact: true }).last()).toBeVisible();
  await expect(page.getByText(liveMessage.content, { exact: true })).toHaveCount(1);
});

test("AUTH-12 expires an authenticated session on a protected API response", async ({ page }) => {
  await page.route(`**/api/chats/${chatId}/messages?*`, (route) =>
    route.fulfill({ status: 401, json: { error: "Expired session" } })
  );
  await page.goto(`/chat/${chatId}`);
  await expect(page).toHaveURL(/\/login$/);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("auth-storage")!).state);
  expect(state.isAuthenticated).toBe(false);
  expect(state.token).toBeNull();
  await page.goto(`/chat/${chatId}`);
  await expect(page).toHaveURL(/\/login$/);
});

test("AUTH-11 logs out and prevents reopening protected history", async ({ page }) => {
  await page.route("**/api/auth/logout", (route) => route.fulfill({ status: 204 }));
  await page.goto("/chat");
  await page.getByRole("button", { name: /Test Person|Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Logout", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Logout", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("auth-storage")!).state.isAuthenticated
    )
  ).toBe(false);
  // avoid reseeding the session through a new document
  await page.evaluate((id) => {
    window.history.pushState({}, "", `/chat/${id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, chatId);
  await expect(page).toHaveURL(/\/login$/);
});

test("ADMIN-01 redirects a non-admin away from administration", async ({ page }) => {
  const adminRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/admin/")) adminRequests.push(request.url());
  });
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole("button", { name: /Test Person|Account menu/ })).toBeVisible();
  expect(adminRequests).toEqual([]);
});

test("CHAT-05 edits an own message and reconciles its sidebar preview", async ({ page }) => {
  const own = {
    ...message,
    sender_id: currentUser.id,
    sender_name: currentUser.full_name,
    created_at: new Date().toISOString(),
  };
  await page.route(`**/api/chats/${chatId}/messages?*`, (route) =>
    route.fulfill({ json: { data: [own], meta: { has_next: false, has_prev: false } } })
  );
  await page.route("**/api/messages/m1", async (route) => {
    expect(route.request().method()).toBe("PUT");
    expect(route.request().postDataJSON()).toEqual({
      content: "Edited in browser",
      attachment_ids: [],
    });
    await route.fulfill({
      json: { data: { ...own, content: "Edited in browser", edited_at: new Date().toISOString() } },
    });
  });
  await page.goto(`/chat/${chatId}`);
  const bubble = page.locator("#message-m1");
  await bubble.click();
  await bubble
    .locator("button")
    .filter({ has: page.locator("svg.lucide-square-pen") })
    .click();
  await expect(page.getByText("Editing Message", { exact: true })).toBeVisible();
  const editor = page.getByPlaceholder("Type a message...");
  await expect(editor).toHaveValue(message.content);
  await editor.fill("Edited in browser");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(bubble.getByText("Edited in browser", { exact: true })).toBeVisible();
  await expect(bubble.getByText("edited", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Type a message...")).toHaveValue("");
  await expect(page.getByText(message.content, { exact: true })).toHaveCount(0);
});

test("CHAT-06 deletes an own message and updates its reply preview", async ({ page }) => {
  const own = {
    ...message,
    sender_id: currentUser.id,
    sender_name: currentUser.full_name,
    created_at: new Date().toISOString(),
  };
  const reply = {
    ...message,
    id: "m-reply",
    content: "A reply to the original",
    reply_to: {
      id: own.id,
      content: own.content,
      sender_id: own.sender_id,
      sender_name: own.sender_name,
      type: "text",
      attachments: [],
    },
  };
  await page.route(`**/api/chats/${chatId}/messages?*`, (route) =>
    route.fulfill({ json: { data: [reply, own], meta: { has_next: false, has_prev: false } } })
  );
  let deleted = false;
  await page.route("**/api/messages/m1", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    deleted = true;
    await route.fulfill({ status: 204 });
  });
  await page.goto(`/chat/${chatId}`);
  const bubble = page.locator("#message-m1");
  await bubble.click();
  await bubble
    .locator("button")
    .filter({ has: page.locator("svg.lucide-trash-2") })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => deleted).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(bubble).not.toContainText(message.content);
  await expect(page.locator("#message-m-reply")).not.toContainText(message.content);
  await expect(page.locator("#message-m-reply")).toContainText(reply.content);
});
