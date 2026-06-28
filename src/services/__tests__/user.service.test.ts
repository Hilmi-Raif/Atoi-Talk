import { beforeEach, describe, expect, it, vi } from "vitest";
import { userService } from "../user.service";

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

describe("userService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCurrentUser", () => {
    it("calls GET /api/user/current", async () => {
      const user = { id: "u1", full_name: "Test" };
      mockApi.get.mockResolvedValue({ data: { data: user } });

      const result = await userService.getCurrentUser();

      expect(mockApi.get).toHaveBeenCalledWith("/api/user/current", { signal: undefined });
      expect(result).toEqual(user);
    });
  });

  describe("getUserById", () => {
    it("calls GET /api/users/:id", async () => {
      const user = { id: "u1", full_name: "Test" };
      mockApi.get.mockResolvedValue({ data: { data: user } });

      const result = await userService.getUserById("u1");

      expect(mockApi.get).toHaveBeenCalledWith("/api/users/u1", { signal: undefined });
      expect(result).toEqual(user);
    });
  });

  describe("updateProfile", () => {
    it("calls PUT /api/user/profile with JSON payload", async () => {
      const user = { id: "u1", full_name: "Updated" };
      mockApi.put.mockResolvedValue({ data: { data: user } });

      const payload = {
        username: "updated",
        full_name: "Updated",
        bio: "Hello",
        avatar_media_id: "media-1",
      };
      const result = await userService.updateProfile(payload);

      expect(mockApi.put).toHaveBeenCalledWith("/api/user/profile", payload);
      expect(result).toEqual(user);
    });
  });

  describe("searchUsers", () => {
    it("calls GET /api/users with params", async () => {
      const data = { data: [], meta: { has_next: false } };
      mockApi.get.mockResolvedValue({ data });

      const result = await userService.searchUsers({ query: "john", limit: 20 });

      expect(mockApi.get).toHaveBeenCalledWith("/api/users", {
        params: { query: "john", limit: 20 },
        signal: undefined,
      });
      expect(result).toEqual(data);
    });
  });

  describe("getBlockedUsers", () => {
    it("calls GET /api/users/blocked with params", async () => {
      const data = { data: [], meta: { has_next: false } };
      mockApi.get.mockResolvedValue({ data });

      const result = await userService.getBlockedUsers({ query: "" });

      expect(mockApi.get).toHaveBeenCalledWith("/api/users/blocked", {
        params: { query: "" },
        signal: undefined,
      });
      expect(result).toEqual(data);
    });
  });

  describe("blockUser", () => {
    it("calls POST /api/users/:userId/block", async () => {
      mockApi.post.mockResolvedValue({});

      await userService.blockUser("u2");

      expect(mockApi.post).toHaveBeenCalledWith("/api/users/u2/block");
    });
  });

  describe("unblockUser", () => {
    it("calls POST /api/users/:userId/unblock", async () => {
      mockApi.post.mockResolvedValue({});

      await userService.unblockUser("u2");

      expect(mockApi.post).toHaveBeenCalledWith("/api/users/u2/unblock");
    });
  });
});
