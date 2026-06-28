import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatService } from "../chat.service";

vi.mock("@/lib/axios", () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return { default: mockApi, api: mockApi };
});

import api from "@/lib/axios";
const mockApi = vi.mocked(api);

describe("chatService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getChats", () => {
    it("calls GET /api/chats with params", async () => {
      const data = { data: [], meta: { has_next: false } };
      mockApi.get.mockResolvedValue({ data });

      const result = await chatService.getChats({ limit: 20 });

      expect(mockApi.get).toHaveBeenCalledWith("/api/chats", {
        params: { limit: 20 },
        signal: undefined,
      });
      expect(result).toEqual(data);
    });

    it("passes signal for abort", async () => {
      const signal = new AbortController().signal;
      mockApi.get.mockResolvedValue({ data: { data: [], meta: {} } });

      await chatService.getChats({}, signal);

      expect(mockApi.get).toHaveBeenCalledWith("/api/chats", { params: {}, signal });
    });
  });

  describe("createPrivateChat", () => {
    it("calls POST /api/chats/private", async () => {
      const chat = { id: "chat-1" };
      mockApi.post.mockResolvedValue({ data: { data: chat } });

      const result = await chatService.createPrivateChat({ target_user_id: "u2" });

      expect(mockApi.post).toHaveBeenCalledWith("/api/chats/private", { target_user_id: "u2" });
      expect(result).toEqual(chat);
    });
  });

  describe("hideChat", () => {
    it("calls POST /api/chats/:chatId/hide", async () => {
      mockApi.post.mockResolvedValue({});

      await chatService.hideChat("chat-1");

      expect(mockApi.post).toHaveBeenCalledWith("/api/chats/chat-1/hide");
    });
  });

  describe("markAsRead", () => {
    it("calls POST /api/chats/:chatId/read", async () => {
      mockApi.post.mockResolvedValue({});

      await chatService.markAsRead("chat-1");

      expect(mockApi.post).toHaveBeenCalledWith("/api/chats/chat-1/read");
    });
  });

  describe("getChatById", () => {
    it("calls GET /api/chats/:chatId", async () => {
      const chat = { id: "chat-1", name: "Test" };
      mockApi.get.mockResolvedValue({ data: { data: chat } });

      const result = await chatService.getChatById("chat-1");

      expect(mockApi.get).toHaveBeenCalledWith("/api/chats/chat-1", { signal: undefined });
      expect(result).toEqual(chat);
    });
  });

  describe("createGroup", () => {
    it("calls POST /api/chats/group with JSON payload", async () => {
      const group = { id: "g1", name: "Group" };
      mockApi.post.mockResolvedValue({ data: { data: group } });

      const payload = {
        name: "Group",
        description: "Desc",
        member_ids: ["u1"],
        is_public: true,
        avatar_media_id: "media-1",
      };
      const result = await chatService.createGroup(payload);

      expect(mockApi.post).toHaveBeenCalledWith("/api/chats/group", payload);
      expect(result).toEqual(group);
    });
  });

  describe("updateGroup", () => {
    it("calls PUT /api/chats/group/:chatId with JSON payload", async () => {
      const updated = { id: "g1", name: "Updated", chat_id: "c1" };
      mockApi.put.mockResolvedValue({ data: { data: updated } });

      const payload = { name: "Updated", description: "Desc", delete_avatar: true };
      const result = await chatService.updateGroup("c1", payload);

      expect(mockApi.put).toHaveBeenCalledWith("/api/chats/group/c1", payload);
      expect(result).toEqual(updated);
    });
  });

  describe("leaveGroup", () => {
    it("calls POST /api/chats/group/:chatId/leave", async () => {
      mockApi.post.mockResolvedValue({ data: { data: {} } });

      await chatService.leaveGroup("c1");

      expect(mockApi.post).toHaveBeenCalledWith("/api/chats/group/c1/leave");
    });
  });

  describe("addGroupMember", () => {
    it("calls POST /api/chats/group/:chatId/members with user_ids", async () => {
      mockApi.post.mockResolvedValue({ data: { data: {} } });

      await chatService.addGroupMember("c1", ["u1", "u2"]);

      expect(mockApi.post).toHaveBeenCalledWith("/api/chats/group/c1/members", {
        user_ids: ["u1", "u2"],
      });
    });
  });

  describe("kickGroupMember", () => {
    it("calls POST /api/chats/group/:chatId/members/:userId/kick", async () => {
      mockApi.post.mockResolvedValue({ data: { data: {} } });

      await chatService.kickGroupMember("c1", "u2");

      expect(mockApi.post).toHaveBeenCalledWith("/api/chats/group/c1/members/u2/kick");
    });
  });

  describe("deleteGroup", () => {
    it("calls DELETE /api/chats/group/:chatId", async () => {
      mockApi.delete.mockResolvedValue({});

      await chatService.deleteGroup("c1");

      expect(mockApi.delete).toHaveBeenCalledWith("/api/chats/group/c1");
    });
  });

  describe("updateMemberRole", () => {
    it("calls PUT /api/chats/group/:chatId/members/:userId/role", async () => {
      mockApi.put.mockResolvedValue({ data: { data: {} } });

      await chatService.updateMemberRole("c1", "u2", "admin");

      expect(mockApi.put).toHaveBeenCalledWith("/api/chats/group/c1/members/u2/role", {
        role: "admin",
      });
    });
  });

  describe("transferOwnership", () => {
    it("calls POST /api/chats/group/:chatId/transfer", async () => {
      mockApi.post.mockResolvedValue({ data: { data: {} } });

      await chatService.transferOwnership("c1", "u2");

      expect(mockApi.post).toHaveBeenCalledWith("/api/chats/group/c1/transfer", {
        new_owner_id: "u2",
      });
    });
  });

  describe("getGroupMembers", () => {
    it("calls GET /api/chats/group/:chatId/members with params", async () => {
      const data = { data: [], meta: { has_next: false } };
      mockApi.get.mockResolvedValue({ data });

      const result = await chatService.getGroupMembers("c1", { query: "john", limit: 20 });

      expect(mockApi.get).toHaveBeenCalledWith("/api/chats/group/c1/members", {
        params: { query: "john", limit: 20 },
        signal: undefined,
      });
      expect(result).toEqual(data);
    });
  });

  describe("resetGroupInviteCode", () => {
    it("calls PUT /api/chats/group/:chatId/invite and extracts code", async () => {
      mockApi.put.mockResolvedValue({
        data: { data: { invite_code: "ABC123", expires_at: "2025-12-31" } },
      });

      const result = await chatService.resetGroupInviteCode("c1");

      expect(mockApi.put).toHaveBeenCalledWith("/api/chats/group/c1/invite");
      expect(result).toEqual({ code: "ABC123", expires_at: "2025-12-31" });
    });

    it("falls back to code field if invite_code is missing", async () => {
      mockApi.put.mockResolvedValue({
        data: { data: { code: "XYZ789", expires_at: "2025-12-31" } },
      });

      const result = await chatService.resetGroupInviteCode("c1");

      expect(result.code).toBe("XYZ789");
    });
  });

  describe("getGroupPreview", () => {
    it("calls GET /api/chats/group/invite/:inviteCode", async () => {
      const chat = { id: "g1", name: "Group" };
      mockApi.get.mockResolvedValue({ data: { data: chat } });

      const result = await chatService.getGroupPreview("ABC123");

      expect(mockApi.get).toHaveBeenCalledWith("/api/chats/group/invite/ABC123", {
        signal: undefined,
      });
      expect(result).toEqual(chat);
    });
  });

  describe("joinGroupByInvite", () => {
    it("calls POST /api/chats/group/join/invite", async () => {
      const chat = { id: "g1" };
      mockApi.post.mockResolvedValue({ data: { data: chat } });

      const result = await chatService.joinGroupByInvite("ABC123");

      expect(mockApi.post).toHaveBeenCalledWith("/api/chats/group/join/invite", {
        invite_code: "ABC123",
      });
      expect(result).toEqual(chat);
    });
  });

  describe("searchPublicGroups", () => {
    it("calls GET /api/chats/group/public with params", async () => {
      const data = { data: [], meta: { has_next: false } };
      mockApi.get.mockResolvedValue({ data });

      const result = await chatService.searchPublicGroups({ query: "study" });

      expect(mockApi.get).toHaveBeenCalledWith("/api/chats/group/public", {
        params: { query: "study" },
        signal: undefined,
      });
      expect(result).toEqual(data);
    });
  });

  describe("joinGroup", () => {
    it("returns data from response.data.data", async () => {
      const chat = { id: "g1", name: "Group" };
      mockApi.post.mockResolvedValue({ data: { data: chat } });

      const result = await chatService.joinGroup("c1");

      expect(mockApi.post).toHaveBeenCalledWith("/api/chats/group/c1/join");
      expect(result).toEqual(chat);
    });

    it("falls back to response.data when no nested data", async () => {
      const chat = { id: "g1", name: "Group" };
      mockApi.post.mockResolvedValue({ data: chat });

      const result = await chatService.joinGroup("c1");

      expect(result).toEqual(chat);
    });

    it("returns null when response.data is falsy", async () => {
      mockApi.post.mockResolvedValue({ data: null });

      const result = await chatService.joinGroup("c1");

      expect(result).toBeNull();
    });
  });
});
