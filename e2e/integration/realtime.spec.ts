import {
  devices,
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const api = "http://127.0.0.1:18080";
const password = "IntegrationPassword1!";

test("an admin bans and unbans a real account through the user management UI", async ({
  browser,
  request,
}) => {
  const admin = await register(request, "moderator");
  const target = await register(request, "moderated");
  expect(admin.user.id).toMatch(/^[\da-f-]{36}$/);
  const compose = resolve("e2e/backend/compose.yaml");
  const args = [
    "compose",
    "-f",
    process.platform === "win32"
      ? compose
          .replace(/^([A-Za-z]):/, (_, drive: string) => `/mnt/${drive.toLowerCase()}`)
          .replaceAll("\\", "/")
      : compose,
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "e2e",
    "-d",
    "atoitalk_e2e",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `UPDATE users SET role = 'admin' WHERE id = '${admin.user.id}' RETURNING id;`,
  ];
  const result = execFileSync(
    process.platform === "win32" ? "wsl.exe" : "docker",
    process.platform === "win32" ? ["-d", "Ubuntu", "--", "docker", ...args] : args,
    { encoding: "utf8" }
  );
  expect(result).toContain(admin.user.id);
  const login = await request.post(`${api}/api/auth/login`, {
    data: { email: admin.user.email, password },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  const session = (await login.json()).data;
  const context = await browser.newContext();
  try {
    await authenticate(context, session);
    const page = await context.newPage();
    await page.goto("/admin/users");
    await page.getByPlaceholder(/Search/).fill(target.user.email);
    const row = page.getByRole("row").filter({ hasText: target.user.email });
    await row.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Ban User", exact: true }).click();
    const ban = page.getByRole("dialog", { name: "Ban User", exact: true });
    await ban.getByLabel("Reason for ban *").fill("Integration moderation check");
    await ban.getByRole("button", { name: "Ban User", exact: true }).click();
    await expect(ban).not.toBeVisible();
    const denied = await request.post(`${api}/api/auth/login`, {
      data: { email: target.user.email, password },
    });
    expect(denied.status()).toBe(403);
    await row.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Unban User", exact: true }).click();
    const unban = page.getByRole("dialog", { name: "Unban User", exact: true });
    await unban.getByRole("button", { name: "Unban User", exact: true }).click();
    await expect(unban).not.toBeVisible();
    const allowed = await request.post(`${api}/api/auth/login`, {
      data: { email: target.user.email, password },
    });
    expect(allowed.ok(), await allowed.text()).toBeTruthy();
  } finally {
    await context.close();
  }
});

test("disabled captcha leaves login usable without contacting cloudflare", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("challenges.cloudflare.com")) requests.push(request.url());
  });
  await page.route("https://challenges.cloudflare.com/**", (route) => route.abort());
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Login", exact: true })).toBeEnabled();
  expect(requests).toEqual([]);
});

async function readOTP(request: APIRequestContext, email: string, excludedIds: string[] = []) {
  let code = "";
  await expect
    .poll(
      async () => {
        const response = await request.get("http://127.0.0.1:18025/api/v1/messages");
        const inbox = await response.json();
        const message = inbox.messages.find(
          (item: { ID: string; To: { Address: string }[] }) =>
            !excludedIds.includes(item.ID) && item.To.some((to) => to.Address === email)
        );
        code = message?.Snippet.match(/\b\d{6}\b/)?.[0] ?? "";
        return code;
      },
      { timeout: 15000 }
    )
    .not.toBe("");
  return code;
}

async function register(request: APIRequestContext, label: string) {
  const username = `e2e${label}${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const email = `${username}@atoitalk.test`;
  const otp = await request.post(`${api}/api/otp/send`, {
    data: { email, mode: "register" },
  });
  expect(otp.ok(), await otp.text()).toBeTruthy();
  const code = await readOTP(request, email);
  const response = await request.post(`${api}/api/auth/register`, {
    data: { email, username, full_name: `E2E ${label}`, password, code },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).data;
}

async function authenticate(context: BrowserContext, session: { token: string; user: unknown }) {
  await context.addInitScript((session) => {
    localStorage.setItem(
      "auth-storage",
      JSON.stringify({ state: { ...session, isAuthenticated: true }, version: 0 })
    );
  }, session);
}

test("group creation and member role changes are completed through the real UI", async ({
  browser,
  request,
}) => {
  const owner = await register(request, "uiowner");
  const member = await register(request, "uimember");
  const context = await browser.newContext();
  try {
    await authenticate(context, owner);
    const page = await context.newPage();
    await page.goto("/chat");
    await page.getByRole("button", { name: "Groups", exact: true }).click();
    await page.getByRole("tab", { name: "Create Group" }).click();
    const name = `UI group ${Date.now()}`;
    await page.getByPlaceholder("Enter group name").fill(name);
    await page
      .getByRole("dialog", { name: "Groups", exact: true })
      .locator("button:has(svg.lucide-plus)")
      .click();
    const selection = page.getByRole("dialog", { name: "Add Members to Group" });
    await selection.getByPlaceholder("Search users...").fill(member.user.username);
    await selection.getByText(member.user.full_name, { exact: true }).click();
    await expect(selection.getByRole("checkbox")).toBeChecked();
    await selection.getByRole("button", { name: /Add Selected/ }).click();
    await page.getByRole("button", { name: "Create Group", exact: true }).click();
    await expect(page).toHaveURL(/\/chat\/[\da-f-]+$/);
    const chatId = page.url().split("/").pop()!;
    await page.locator("header").getByText(name, { exact: true }).click();
    await page.getByRole("tab", { name: "Members", exact: true }).click();
    for (const [action, title, confirm, role] of [
      ["Promote to Admin", "Promote to Admin?", "Promote", "admin"],
      ["Demote to Member", "Demote to Member?", "Demote", "member"],
    ]) {
      await page.getByTitle("Member Settings", { exact: true }).click();
      await page.getByRole("menuitem", { name: action, exact: true }).click();
      await page
        .getByRole("dialog", { name: title, exact: true })
        .getByRole("button", { name: confirm, exact: true })
        .click();
      await expect
        .poll(async () => {
          const response = await request.get(`${api}/api/chats/group/${chatId}/members`, {
            headers: { Authorization: `Bearer ${owner.token}` },
          });
          expect(response.ok(), await response.text()).toBeTruthy();
          return (await response.json()).data.find(
            (item: { user_id: string }) => item.user_id === member.user.id
          )?.role;
        })
        .toBe(role);
    }
    await page.getByTitle("Member Settings", { exact: true }).click();
    await page.getByRole("menuitem", { name: "Transfer Ownership", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Transfer Ownership?", exact: true })
      .getByRole("button", { name: "Transfer Ownership", exact: true })
      .click();
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await page.getByRole("button", { name: "Leave", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Leave Group?", exact: true })
      .getByRole("button", { name: "Leave", exact: true })
      .click();
    await expect(page).toHaveURL(/\/chat$/);
    const newOwnerContext = await browser.newContext();
    try {
      await authenticate(newOwnerContext, member);
      const newOwnerPage = await newOwnerContext.newPage();
      await newOwnerPage.goto(`/chat/${chatId}`);
      await newOwnerPage.locator("header").getByText(name, { exact: true }).click();
      await newOwnerPage.getByRole("button", { name: "Delete", exact: true }).click();
      await newOwnerPage
        .getByRole("dialog", { name: "Delete Group?", exact: true })
        .getByRole("button", { name: "Delete Group", exact: true })
        .click();
      await expect(newOwnerPage).toHaveURL(/\/chat$/);
      const missing = await request.get(`${api}/api/chats/${chatId}`, {
        headers: { Authorization: `Bearer ${member.token}` },
      });
      expect([403, 404]).toContain(missing.status());
    } finally {
      await newOwnerContext.close();
    }
  } finally {
    await context.close();
  }
});

test("older history is paginated and a reply jumps outside the loaded window", async ({
  browser,
  request,
}) => {
  const sender = await register(request, "historysender");
  const recipient = await register(request, "historyrecipient");
  const headers = { Authorization: `Bearer ${sender.token}` };
  const created = await request.post(`${api}/api/chats/private`, {
    headers,
    data: { target_user_id: recipient.user.id },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const chat = (await created.json()).data;
  const messages: { id: string; content: string }[] = [];
  for (let index = 0; index < 65; index++) {
    const content = `History ${index.toString().padStart(2, "0")} ${chat.id}`;
    const response = await request.post(`${api}/api/messages`, {
      headers,
      data: { chat_id: chat.id, type: "text", content },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    messages.push((await response.json()).data);
  }
  const reply = await request.post(`${api}/api/messages`, {
    headers,
    data: {
      chat_id: chat.id,
      type: "text",
      content: "Jump to oldest history",
      reply_to_id: messages[0].id,
    },
  });
  expect(reply.ok(), await reply.text()).toBeTruthy();
  const replyMessage = (await reply.json()).data;
  const context = await browser.newContext();
  try {
    await authenticate(context, recipient);
    const page = await context.newPage();
    await page.goto(`/chat/${chat.id}`);
    const bubble = page.locator(`#message-${replyMessage.id}`);
    await expect(bubble).toBeVisible();
    await bubble.locator('[data-slot="card"]').filter({ hasText: messages[0].content }).click();
    await expect(page.locator(`#message-${messages[0].id}`)).toBeVisible();
    await expect(page.locator(`#message-${messages[0].id} .ring-2`)).toHaveCount(1);
    await page.reload();
    await expect(page.locator(`#message-${replyMessage.id}`)).toBeVisible();
    await page.locator(`#message-${replyMessage.id}`).hover();
    await expect
      .poll(
        async () => {
          await page.mouse.wheel(0, -2500);
          return page.locator(`#message-${messages[0].id}`).isVisible();
        },
        { timeout: 20000 }
      )
      .toBe(true);
  } finally {
    await context.close();
  }
});

test("a revoked session is cleared and cannot restore protected pages", async ({
  page,
  request,
}) => {
  const session = await register(request, "revoked");
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(session.user.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL(/\/chat$/);
  const token = await page.evaluate(
    () => JSON.parse(localStorage.getItem("auth-storage")!).state.token as string
  );
  const revoked = await request.post(`${api}/api/auth/logout`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(revoked.ok(), await revoked.text()).toBeTruthy();
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("auth-storage")!).state.isAuthenticated)
    )
    .toBe(false);
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/login$/);
});

test("blocking and unblocking through the profile updates both real conversations", async ({
  browser,
  request,
}) => {
  const owner = await register(request, "blockowner");
  const partner = await register(request, "blockpartner");
  const created = await request.post(`${api}/api/chats/private`, {
    headers: { Authorization: `Bearer ${owner.token}` },
    data: { target_user_id: partner.user.id },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const chat = (await created.json()).data;
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    await authenticate(first, owner);
    await authenticate(second, partner);
    const a = await first.newPage();
    const b = await second.newPage();
    await Promise.all([a.goto(`/chat/${chat.id}`), b.goto(`/chat/${chat.id}`)]);
    await expect(a.getByPlaceholder("Type a message...")).toBeVisible();
    await expect(b.getByPlaceholder("Type a message...")).toBeVisible();
    await a.locator("header").getByText(partner.user.full_name, { exact: true }).click();
    await a.getByRole("dialog").getByRole("button", { name: "Block", exact: true }).click();
    await a
      .getByRole("dialog", { name: "Block User" })
      .getByRole("button", { name: "Block", exact: true })
      .click();
    await expect(a.getByRole("button", { name: "Unblock", exact: true })).toBeVisible();
    await expect(b.getByPlaceholder("Type a message...")).toHaveCount(0);
    const denied = await request.post(`${api}/api/messages`, {
      headers: { Authorization: `Bearer ${partner.token}` },
      data: { chat_id: chat.id, type: "text", content: "Blocked message" },
    });
    expect(denied.status()).toBe(403);
    await a.getByRole("button", { name: "Unblock", exact: true }).click();
    await a
      .getByRole("dialog", { name: "Unblock User" })
      .getByRole("button", { name: "Unblock", exact: true })
      .click();
    await a.keyboard.press("Escape");
    await expect(a.getByPlaceholder("Type a message...")).toBeVisible();
    await expect(b.getByPlaceholder("Type a message...")).toBeVisible();
    const text = `After unblock ${Date.now()}`;
    await b.getByPlaceholder("Type a message...").fill(text);
    await b.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(a.locator('[id^="message-"]').filter({ hasText: text })).toHaveCount(1);
  } finally {
    await first.close();
    await second.close();
  }
});

test("mobile messaging and notification preferences survive navigation and reload", async ({
  browser,
  request,
}) => {
  const mobile = await register(request, "mobile");
  const partner = await register(request, "mobilepartner");
  const created = await request.post(`${api}/api/chats/private`, {
    headers: { Authorization: `Bearer ${mobile.token}` },
    data: { target_user_id: partner.user.id },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const chat = (await created.json()).data;
  const first = await browser.newContext({ ...devices["Pixel 7"] });
  const second = await browser.newContext();
  try {
    await authenticate(first, mobile);
    await authenticate(second, partner);
    const a = await first.newPage();
    const b = await second.newPage();
    await Promise.all([a.goto(`/chat/${chat.id}`), b.goto(`/chat/${chat.id}`)]);
    const text = `Mobile message ${Date.now()}`;
    await a.getByPlaceholder("Type a message...").fill(text);
    await a.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(b.locator('[id^="message-"]').filter({ hasText: text })).toHaveCount(1);
    await a.getByRole("button", { name: "Back to chats" }).click();
    await expect(a).toHaveURL(/\/chat$/);
    const row = a
      .locator("li")
      .filter({ has: a.getByRole("button", { name: new RegExp(partner.user.full_name) }) })
      .first();
    await row
      .locator("button:has(svg.lucide-ellipsis-vertical), button:has(svg.lucide-ellipsis)")
      .click();
    await a.getByRole("menuitem", { name: "Notifications", exact: true }).click();
    await a.getByRole("menuitem", { name: "Mute until I turn it back on" }).click();
    await expect(a.getByRole("img", { name: "Notifications muted" })).toBeVisible();
    await a.reload();
    await expect(a.getByRole("img", { name: "Notifications muted" })).toBeVisible();
    await a.getByRole("button", { name: new RegExp(partner.user.full_name) }).click();
    await expect(a.locator('[id^="message-"]').filter({ hasText: text })).toHaveCount(1);
  } finally {
    await first.close();
    await second.close();
  }
});

test("a disconnected recipient reconnects and retrieves missed history after reload", async ({
  browser,
  request,
}) => {
  const sender = await register(request, "reconnectsender");
  const recipient = await register(request, "reconnectrecipient");
  const response = await request.post(`${api}/api/chats/private`, {
    headers: { Authorization: `Bearer ${sender.token}` },
    data: { target_user_id: recipient.user.id },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const chat = (await response.json()).data;
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    await authenticate(first, sender);
    await authenticate(second, recipient);
    await second.addInitScript(() => {
      const sockets: WebSocket[] = [];
      Object.assign(window, { e2eSockets: sockets });
      const NativeWebSocket = window.WebSocket;
      window.WebSocket = class extends NativeWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          sockets.push(this);
        }
      };
    });
    const a = await first.newPage();
    const b = await second.newPage();
    const socketPromise = b.waitForEvent("websocket", {
      predicate: (socket) => socket.url().includes(":18081/ws"),
    });
    await Promise.all([a.goto(`/chat/${chat.id}`), b.goto(`/chat/${chat.id}`)]);
    const socket = await socketPromise;
    await expect(a.getByPlaceholder("Type a message...")).toBeVisible();
    await expect(b.getByPlaceholder("Type a message...")).toBeVisible();
    const closed = socket.waitForEvent("close");
    await second.setOffline(true);
    await b.evaluate(() => {
      const sockets = (window as unknown as { e2eSockets: WebSocket[] }).e2eSockets;
      sockets.forEach((connection) => connection.close());
    });
    await closed;
    const missed = `Missed while offline ${Date.now()}`;
    await a.getByPlaceholder("Type a message...").fill(missed);
    await a.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(a.locator('[id^="message-"]').filter({ hasText: missed })).toHaveCount(1);
    const draft = `Retry offline draft ${Date.now()}`;
    await b.getByPlaceholder("Type a message...").fill(draft);
    await b.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(b.getByPlaceholder("Type a message...")).toHaveValue(draft);
    const reconnected = b.waitForEvent("websocket", {
      predicate: (next) => next.url().includes(":18081/ws"),
    });
    await second.setOffline(false);
    await reconnected;
    await expect(a.locator('[id^="message-"]').filter({ hasText: draft })).toHaveCount(1);
    await expect(b.getByPlaceholder("Type a message...")).toHaveValue("");
    const live = `Received after reconnect ${Date.now()}`;
    await a.getByPlaceholder("Type a message...").fill(live);
    await a.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(b.locator('[id^="message-"]').filter({ hasText: live })).toHaveCount(1);
    await b.reload();
    await expect(b.locator('[id^="message-"]').filter({ hasText: missed })).toHaveCount(1);
    await expect(b.locator('[id^="message-"]').filter({ hasText: live })).toHaveCount(1);
  } finally {
    await first.close();
    await second.close();
  }
});

test("an outsider cannot read or send to another private conversation", async ({
  browser,
  request,
}) => {
  const owner = await register(request, "privateowner");
  const partner = await register(request, "privatepartner");
  const outsider = await register(request, "outsider");
  const created = await request.post(`${api}/api/chats/private`, {
    headers: { Authorization: `Bearer ${owner.token}` },
    data: { target_user_id: partner.user.id },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const chat = (await created.json()).data;
  const secret = `Private content ${Date.now()}`;
  const sent = await request.post(`${api}/api/messages`, {
    headers: { Authorization: `Bearer ${owner.token}` },
    data: { chat_id: chat.id, type: "text", content: secret },
  });
  expect(sent.ok(), await sent.text()).toBeTruthy();
  const headers = { Authorization: `Bearer ${outsider.token}` };
  const history = await request.get(`${api}/api/chats/${chat.id}/messages?limit=30`, { headers });
  expect([403, 404]).toContain(history.status());
  expect(await history.text()).not.toContain(secret);
  const denied = await request.post(`${api}/api/messages`, {
    headers,
    data: { chat_id: chat.id, type: "text", content: "Unauthorized injection" },
  });
  expect([403, 404]).toContain(denied.status());
  const context = await browser.newContext();
  try {
    await authenticate(context, outsider);
    const page = await context.newPage();
    await page.goto(`/chat/${chat.id}`);
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
    await expect(page.getByPlaceholder("Type a message...")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("a removed group member loses browser access and cannot send or promote members", async ({
  browser,
  request,
}) => {
  const owner = await register(request, "kickowner");
  const member = await register(request, "kickmember");
  const ownerHeaders = { Authorization: `Bearer ${owner.token}` };
  const memberHeaders = { Authorization: `Bearer ${member.token}` };
  const response = await request.post(`${api}/api/chats/group`, {
    headers: ownerHeaders,
    data: { name: "Membership enforcement", member_ids: [member.user.id], is_public: false },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const group = (await response.json()).data;
  const promotion = await request.put(
    `${api}/api/chats/group/${group.id}/members/${member.user.id}/role`,
    {
      headers: memberHeaders,
      data: { role: "admin" },
    }
  );
  expect(promotion.status()).toBe(403);
  const context = await browser.newContext();
  try {
    await authenticate(context, member);
    const page = await context.newPage();
    await page.goto(`/chat/${group.id}`);
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
    const kicked = await request.post(
      `${api}/api/chats/group/${group.id}/members/${member.user.id}/kick`,
      {
        headers: ownerHeaders,
      }
    );
    expect(kicked.ok(), await kicked.text()).toBeTruthy();
    await expect(page).toHaveURL(/\/chat$/);
    const forbidden = await request.post(`${api}/api/messages`, {
      headers: memberHeaders,
      data: { chat_id: group.id, type: "text", content: "Message after removal" },
    });
    expect([403, 404]).toContain(forbidden.status());
    await page.goto(`/chat/${group.id}`);
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByPlaceholder("Type a message...")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("password recovery consumes a real emailed OTP and the new password authenticates", async ({
  page,
  request,
}) => {
  const session = await register(request, "recovery");
  const nextPassword = "RecoveredPassword2!";
  await page.goto("/forgot");
  await page.getByPlaceholder("Email", { exact: true }).fill(session.user.email);
  const requestOTP = page.getByRole("button", { name: /Request OTP/ });
  await expect(requestOTP).toBeEnabled({ timeout: 30000 });
  const previousInbox = await (await request.get("http://127.0.0.1:18025/api/v1/messages")).json();
  const previousIds = previousInbox.messages.map((item: { ID: string }) => item.ID);
  const otpResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/otp/send") && response.request().method() === "POST"
  );
  await requestOTP.click();
  expect((await otpResponse).ok()).toBeTruthy();
  const code = await readOTP(request, session.user.email, previousIds);
  await page.getByPlaceholder("OTP Code").fill(code);
  await page.getByPlaceholder("New Password", { exact: true }).fill(nextPassword);
  await page.getByPlaceholder("Confirm Password", { exact: true }).fill(nextPassword);
  const reset = page.getByRole("button", { name: /^Reset Password/ });
  await expect(reset).toBeEnabled({ timeout: 30000 });
  await reset.click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email", { exact: true }).fill(session.user.email);
  await page.getByLabel("Password", { exact: true }).fill(nextPassword);
  const login = page.getByRole("button", { name: "Login", exact: true });
  await expect(login).toBeEnabled({ timeout: 30000 });
  await login.click();
  await expect(page).toHaveURL(/\/chat$/);
});

test("two registered accounts exchange live messages and retain history after reload", async ({
  browser,
  request,
}) => {
  const alice = await register(request, "alice");
  const bob = await register(request, "bob");
  const created = await request.post(`${api}/api/chats/private`, {
    headers: { Authorization: `Bearer ${alice.token}` },
    data: { target_user_id: bob.user.id },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const chat = (await created.json()).data;
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    await authenticate(first, alice);
    await authenticate(second, bob);
    const a = await first.newPage();
    const b = await second.newPage();
    const connected = (page: typeof a) =>
      page.waitForEvent("websocket", { predicate: (socket) => socket.url().includes(":18081/ws") });
    const aSocket = connected(a);
    const bSocket = connected(b);
    await Promise.all([a.goto(`/chat/${chat.id}`), b.goto(`/chat/${chat.id}`)]);
    await Promise.all([aSocket, bSocket]);
    await expect(a.getByPlaceholder("Type a message...")).toBeVisible();
    await expect(b.getByPlaceholder("Type a message...")).toBeVisible();
    const text = `Live message ${Date.now()}`;
    await a.getByPlaceholder("Type a message...").fill(text);
    await a.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(b.getByText(text, { exact: true }).last()).toBeVisible();
    const reply = `Reply ${Date.now()}`;
    await b.getByPlaceholder("Type a message...").fill(reply);
    await b.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(a.getByText(reply, { exact: true }).last()).toBeVisible();
    const own = a.locator('[id^="message-"]').filter({ hasText: text });
    await own.click();
    await own.locator("button:has(svg.lucide-square-pen)").click();
    await a.getByPlaceholder("Type a message...").fill(`${text} edited`);
    await a.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(b.getByText(`${text} edited`, { exact: true }).last()).toBeVisible();
    await a.reload();
    await expect(a.getByText(`${text} edited`, { exact: true }).last()).toBeVisible();
    await expect(a.getByText(reply, { exact: true }).last()).toBeVisible();
    const edited = a.locator('[id^="message-"]').filter({ hasText: `${text} edited` });
    await edited.click();
    await edited.locator("button:has(svg.lucide-trash-2)").click();
    await a.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(b.getByText(`${text} edited`, { exact: true })).toHaveCount(0);
    await b.reload();
    await expect(b.getByText(`${text} edited`, { exact: true })).toHaveCount(0);
    await expect(b.getByText(reply, { exact: true }).last()).toBeVisible();
  } finally {
    await first.close();
    await second.close();
  }
});

test("registration requests a real OTP and creates a session through the browser form", async ({
  page,
  request,
}) => {
  const username = `e2eform${Date.now()}`;
  const email = `${username}@atoitalk.test`;
  await page.goto("/register");
  await page.getByPlaceholder("Email", { exact: true }).fill(email);
  const sendOTP = page.getByRole("button", { name: "Request OTP", exact: true });
  await expect(sendOTP).toBeEnabled({ timeout: 30000 });
  await sendOTP.click();
  const code = await readOTP(request, email);
  await page.getByPlaceholder("OTP Code", { exact: true }).fill(code);
  await page.getByPlaceholder("Username", { exact: true }).fill(username);
  await page.getByPlaceholder("Full Name", { exact: true }).fill("Registered from browser");
  await page.getByPlaceholder("Password", { exact: true }).fill(password);
  const submit = page.getByRole("button", { name: /^Register(?: Loading)?$/, exact: true });
  await expect(submit).toBeEnabled({ timeout: 30000 });
  await submit.click();
  await expect(page).toHaveURL(/\/chat$/);
  await page.reload();
  await expect(page.getByRole("button", { name: /Registered from browser/ })).toBeVisible();
});

test("group membership, roles, ownership and deletion propagate to real browsers", async ({
  browser,
  request,
}) => {
  const owner = await register(request, "owner");
  const member = await register(request, "member");
  const headers = { Authorization: `Bearer ${owner.token}` };
  const groupResponse = await request.post(`${api}/api/chats/group`, {
    headers,
    data: {
      name: "Integration group",
      description: "Real group lifecycle",
      member_ids: [member.user.id],
      is_public: true,
    },
  });
  expect(groupResponse.ok(), await groupResponse.text()).toBeTruthy();
  const created = (await groupResponse.json()).data;
  const chatId = created.id;
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    await authenticate(first, owner);
    await authenticate(second, member);
    const a = await first.newPage();
    const b = await second.newPage();
    await Promise.all([a.goto(`/chat/${chatId}`), b.goto(`/chat/${chatId}`)]);
    await expect(a.getByPlaceholder("Type a message...")).toBeVisible();
    await expect(b.getByPlaceholder("Type a message...")).toBeVisible();
    const rename = await request.put(`${api}/api/chats/group/${chatId}`, {
      headers,
      data: { name: "Renamed integration group", description: "Updated", is_public: true },
    });
    expect(rename.ok(), await rename.text()).toBeTruthy();
    await expect(b.getByText("Renamed integration group", { exact: true }).first()).toBeVisible();
    const promoted = await request.put(
      `${api}/api/chats/group/${chatId}/members/${member.user.id}/role`,
      { headers, data: { role: "admin" } }
    );
    expect(promoted.ok(), await promoted.text()).toBeTruthy();
    await expect(b.getByText(/promoted/).last()).toBeVisible();
    const transferred = await request.post(`${api}/api/chats/group/${chatId}/transfer`, {
      headers,
      data: { new_owner_id: member.user.id },
    });
    expect(transferred.ok(), await transferred.text()).toBeTruthy();
    // the actor reconciles its own response through the mutation
    await expect(b.getByText(/transferred/).last()).toBeVisible();
    const removed = await request.delete(`${api}/api/chats/group/${chatId}`, {
      headers: { Authorization: `Bearer ${member.token}` },
    });
    expect(removed.ok(), await removed.text()).toBeTruthy();
    await expect(a).toHaveURL(/\/chat$/);
    await expect(b).toHaveURL(/\/chat$/);
  } finally {
    await first.close();
    await second.close();
  }
});

test("an invite joins a real private group and a non-admin is redirected from admin routes", async ({
  browser,
  request,
}) => {
  const owner = await register(request, "inviter");
  const member = await register(request, "invitee");
  const initialMember = await register(request, "founder");
  const response = await request.post(`${api}/api/chats/group`, {
    headers: { Authorization: `Bearer ${owner.token}` },
    data: { name: "Private invite group", member_ids: [initialMember.user.id], is_public: false },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const group = (await response.json()).data;
  const details = await request.get(`${api}/api/chats/${group.id}`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  expect(details.ok(), await details.text()).toBeTruthy();
  const invite = (await details.json()).data.invite_code;
  expect(invite).toBeTruthy();
  const context = await browser.newContext();
  try {
    await authenticate(context, member);
    const page = await context.newPage();
    await page.goto(`/invite/${invite}`);
    await expect(page.getByText("Private invite group", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Join Group/ }).click();
    await expect(page).toHaveURL(new RegExp(`/chat/${group.id}$`));
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
    await page.reload();
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/chat$/);
    const forbidden = await request.get(`${api}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${member.token}` },
    });
    expect(forbidden.status()).toBe(403);
  } finally {
    await context.close();
  }
});

test("a registered user logs in through the real form and logs out", async ({ page, request }) => {
  const session = await register(request, "login");
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(session.user.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const login = page.getByRole("button", { name: /^Login(?: Loading)?$/, exact: true });
  await expect(login).toBeEnabled({ timeout: 30000 });
  await login.click();
  await expect(page).toHaveURL(/\/chat$/);
  await page.reload();
  await expect(page.getByRole("button", { name: /E2E login/ })).toBeVisible();
  await page.getByRole("button", { name: /E2E login/ }).click();
  await page.getByRole("menuitem", { name: "Logout", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Logout", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/login$/);
});

test("profile changes saved through the real dialog survive a reload", async ({
  browser,
  request,
}) => {
  const session = await register(request, "profile");
  const context = await browser.newContext();
  try {
    await authenticate(context, session);
    const page = await context.newPage();
    await page.goto("/chat");
    await page.getByRole("button", { name: /E2E profile/ }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Account Settings" });
    const name = `Updated profile ${Date.now()}`;
    await dialog.getByLabel("Full Name", { exact: true }).fill(name);
    await dialog.getByLabel("Bio", { exact: true }).fill("Profile saved by the real backend");
    await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    await expect(dialog.getByLabel("Full Name", { exact: true })).toHaveValue(name);
    await expect(dialog.getByLabel("Bio", { exact: true })).toHaveValue(
      "Profile saved by the real backend"
    );
    const persisted = await request.get(`${api}/api/user/current`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(persisted.ok(), await persisted.text()).toBeTruthy();
    expect((await persisted.json()).data).toMatchObject({
      full_name: name,
      bio: "Profile saved by the real backend",
    });
  } finally {
    await context.close();
  }
});

test("a browser uploads and sends a file that another browser downloads intact", async ({
  browser,
  request,
}) => {
  const sender = await register(request, "upload");
  const recipient = await register(request, "download");
  const headers = { Authorization: `Bearer ${sender.token}` };
  const created = await request.post(`${api}/api/chats/private`, {
    headers,
    data: { target_user_id: recipient.user.id },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const chat = (await created.json()).data;
  const content = `Real storage content ${Date.now()}`;
  const filename = "integration-document.txt";
  const context = await browser.newContext();
  const senderContext = await browser.newContext();
  try {
    await authenticate(context, recipient);
    await authenticate(senderContext, sender);
    const page = await context.newPage();
    const composer = await senderContext.newPage();
    await Promise.all([page.goto(`/chat/${chat.id}`), composer.goto(`/chat/${chat.id}`)]);
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
    await expect(composer.getByPlaceholder("Type a message...")).toBeVisible();
    await composer.locator("button:has(svg.lucide-file)").click();
    await composer.locator('input[type="file"]').setInputFiles({
      name: filename,
      mimeType: "text/plain",
      buffer: Buffer.from(content),
    });
    await expect(composer.getByText("integration-document", { exact: true })).toBeVisible();
    await composer.getByPlaceholder("Type a message...").fill("Storage attachment");
    await expect(composer.getByRole("button", { name: "Send message", exact: true })).toBeEnabled();
    await composer.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByText("integration-document", { exact: true })).toBeVisible();
    const download = page.waitForEvent("download");
    await page
      .locator('[data-slot="card"]')
      .filter({ hasText: "integration-document" })
      .locator("button:has(svg.lucide-download)")
      .click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(filename);
    expect(await file.failure()).toBeNull();
    const stream = await file.createReadStream();
    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString("utf8")).toBe(content);
    await page.reload();
    await expect(page.getByText("integration-document", { exact: true })).toBeVisible();
  } finally {
    await context.close();
    await senderContext.close();
  }
});
