import { Tabs } from "@/components/ui/tabs";
import { useCreateGroupForm } from "@/hooks/group/use-create-group-form";
import { toast } from "@/lib/toast";
import { chatService, userService } from "@/services";
import { User } from "@/types";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { CreateGroupTab } from "../public-group-search/create-group-tab";

vi.mock("@/services", () => ({
  chatService: { createGroup: vi.fn() },
  userService: { searchUsers: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
vi.mock("@/components/auth/captcha", () => ({ Captcha: () => null }));
vi.mock("@/components/image-cropper", () => ({ ImageCropper: () => null }));
const person = {
  id: "u2",
  full_name: "Ada Lovelace",
  username: "ada",
  avatar: null,
  bio: null,
  email: "ada@example.com",
  has_password: true,
} as User;

describe("create-group form UI", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  const close = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    vi.mocked(userService.searchUsers).mockResolvedValue({ data: [person], meta: {} } as never);
    vi.mocked(chatService.createGroup).mockResolvedValue({
      id: "g1",
      type: "group",
      name: "Engineering",
      messages: [],
    } as never);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
  });
  function Harness() {
    const form = useCreateGroupForm(close);
    return (
      <>
        <button onClick={() => form.setSelectedMembers([person])}>Seed member</button>
        <Tabs defaultValue="create">
          <CreateGroupTab activeTab="create" form={form} />
        </Tabs>
      </>
    );
  }
  function setup() {
    return render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<Harness />} />
          <Route path="/chat/g1" element={<h1>Created group destination</h1>} />
        </Routes>
      </MemoryRouter>,
      { wrapper: context.wrapper }
    );
  }
  it("requires a name and at least one selected member", async () => {
    setup();
    expect(screen.getByRole("button", { name: "Create Group" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Group Name"), { target: { value: "Engineering" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Group" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(chatService.createGroup).not.toHaveBeenCalled();
  });
  it("creates a public group with trimmed name, description and selected identities", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Seed member" }));
    fireEvent.change(screen.getByLabelText("Group Name"), { target: { value: " Engineering " } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: " Team chat " } });
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Create Group" }));
    expect(await screen.findByRole("heading", { name: "Created group destination" })).toBeVisible();
    expect(chatService.createGroup).toHaveBeenCalledWith({
      name: "Engineering",
      description: "Team chat",
      member_ids: ["u2"],
      is_public: true,
      avatar_media_id: undefined,
    });
    expect(close).toHaveBeenCalledWith(false);
  });
  it("removes the selected member by identity and updates the member count", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Seed member" }));
    expect(screen.getByText("Members (1)")).toBeVisible();
    const badge = screen.getByText("Ada Lovelace").closest('[data-slot="badge"]')!;
    fireEvent.click(badge.querySelector("button")!);
    await waitFor(() => expect(screen.getByText("Members (0)")).toBeVisible());
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
  });
  it("adds members through the real searchable selection dialog", async () => {
    const { container } = setup();
    fireEvent.click(container.querySelector("button:has(svg.lucide-plus)")!);
    const dialog = await screen.findByRole("dialog", { name: "Add Members to Group" });
    fireEvent.change(within(dialog).getByPlaceholderText(/Search/), { target: { value: "Ada" } });
    expect(await within(dialog).findByText("Ada Lovelace")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: /Add Selected/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Members (1)")).toBeVisible();
    expect(screen.getByText("Ada Lovelace")).toBeVisible();
  });
  it("retains editable fields and selected members after a rejected creation", async () => {
    vi.mocked(chatService.createGroup).mockRejectedValue(new Error("offline"));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Seed member" }));
    fireEvent.change(screen.getByLabelText("Group Name"), { target: { value: "Engineering" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Group" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByLabelText("Group Name")).toHaveValue("Engineering");
    expect(screen.getByText("Members (1)")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Create Group" })).toBeEnabled());
    expect(close).not.toHaveBeenCalled();
  });
});
