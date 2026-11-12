import { adminService } from "@/services/admin.service";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { ReportDetailDialog } from "../reports/report-detail-dialog";

vi.mock("@/services/admin.service", () => ({
  adminService: { getUser: vi.fn(), getGroupDetail: vi.fn(), getGroupMembersInfinite: vi.fn() },
}));
const report = {
  id: "r1",
  status: "pending",
  created_at: "2026-01-02T12:00:00Z",
  reason: "Spam",
  description: "Repeated unsolicited messages",
  reporter_id: "reporter",
  target_type: "message",
  target_id: "m1",
  evidence_snapshot: { sender_id: "sender", content: "Reported message text" },
};

describe("admin report detail", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    context = createQueryWrapper();
    vi.resetAllMocks();
    vi.mocked(adminService.getUser).mockImplementation(
      async (id) => ({ id, full_name: `Person ${id}`, username: id, avatar: null }) as never
    );
    vi.mocked(adminService.getGroupDetail).mockResolvedValue({
      id: "g1",
      name: "Engineering",
      member_count: 2,
      is_public: false,
      created_at: "2026-01-01T00:00:00Z",
    } as never);
    vi.mocked(adminService.getGroupMembersInfinite).mockResolvedValue({
      data: [],
      meta: {},
    } as never);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
  });
  function setup(overrides: Partial<React.ComponentProps<typeof ReportDetailDialog>> = {}) {
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      reportDetail: report as never,
      isLoading: false,
      onUserAction: vi.fn(),
      onResolve: vi.fn(),
      onReject: vi.fn(),
      onImageClick: vi.fn(),
      isLightboxOpen: false,
      ...overrides,
    };
    render(<ReportDetailDialog {...props} />, { wrapper: context.wrapper });
    return props;
  }
  it("shows a loading state without inventing report evidence", () => {
    setup({ isLoading: true, reportDetail: undefined });
    expect(screen.getByRole("dialog", { name: "Report Details" })).toBeVisible();
    expect(screen.queryByText("Reported Content")).not.toBeInTheDocument();
    expect(screen.queryByText("Failed to load report details.")).not.toBeInTheDocument();
    expect(adminService.getUser).not.toHaveBeenCalled();
  });
  it("shows a recoverable missing-detail state without action buttons", () => {
    setup({ reportDetail: undefined });
    expect(screen.getByText("Failed to load report details.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
  });
  it("renders reporter, sender and evidence and forwards moderation actions for the selected report", async () => {
    const props = setup();
    expect(await screen.findByText("Person reporter")).toBeVisible();
    expect(await screen.findByText("Person sender")).toBeVisible();
    expect(screen.getByText("Spam")).toBeVisible();
    expect(screen.getByText('"Repeated unsolicited messages"')).toBeVisible();
    expect(screen.getByText("Reported message text")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(props.onResolve).toHaveBeenCalledWith(report);
    expect(props.onReject).toHaveBeenCalledWith(report);
  });
  it.each(["resolved", "rejected"])(
    "does not offer another decision on an already %s report",
    (status) => {
      setup({ reportDetail: { ...report, status, description: "" } as never });
      expect(screen.getByText(status)).toBeVisible();
      expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    }
  );
  it.each([undefined, {}])(
    "represents absent message evidence as no content (%s)",
    (evidence_snapshot) => {
      setup({ reportDetail: { ...report, evidence_snapshot } as never });
      expect(screen.getByText("[No Content]")).toBeVisible();
      expect(screen.queryByText("Reported message text")).not.toBeInTheDocument();
    }
  );
  it("renders a reported user and forwards its view-profile action", async () => {
    const props = setup({
      reportDetail: { ...report, target_type: "user", target_id: "target" } as never,
    });
    expect(await screen.findByText("Person target")).toBeVisible();
    const target = screen.getByText("Person target").closest("div.border")!;
    fireEvent.click(within(target as HTMLElement).getByRole("button", { name: "Details" }));
    expect(props.onUserAction).toHaveBeenCalledWith("target", "view");
    expect(screen.queryByText("Message Content")).not.toBeInTheDocument();
  });
  it.each(["chat_id", "group_id"])(
    "resolves a reported group through legacy/current evidence key %s",
    async (key) => {
      setup({
        reportDetail: {
          ...report,
          target_type: "group",
          evidence_snapshot: { [key]: "g1" },
        } as never,
      });
      expect(await screen.findByText("Engineering")).toBeVisible();
      expect(adminService.getGroupDetail).toHaveBeenCalledWith("g1");
      expect(screen.getByText("Reported Group")).toBeVisible();
    }
  );
  it("shows the group context for a message posted in a group", async () => {
    setup({
      reportDetail: {
        ...report,
        evidence_snapshot: { ...report.evidence_snapshot, chat_type: "group", chat_id: "g1" },
      } as never,
    });
    expect(await screen.findByText("Engineering")).toBeVisible();
    expect(screen.getByText("Context: Group Chat")).toBeVisible();
  });
  it.each([1, 2, 3, 5])(
    "opens the selected evidence image in a %s-image gallery",
    async (count) => {
      const attachments = Array.from({ length: count }, (_, index) => ({
        id: `image-${index}`,
        original_name: `image-${index}.png`,
        url: `https://media.example/image-${index}.png`,
        mime_type: "image/png",
        file_size: 100,
      }));
      const props = setup({
        reportDetail: { ...report, evidence_snapshot: { attachments } } as never,
      });
      const images = await screen.findAllByRole("img");
      expect(images).toHaveLength(count);
      fireEvent.load(images[count - 1]);
      fireEvent.click(images[count - 1]);
      expect(props.onImageClick).toHaveBeenCalledWith(count - 1);
      expect(screen.queryByText("[No Content]")).not.toBeInTheDocument();
    }
  );
  it.each([true, false])(
    "keeps Escape reserved for the lightbox only while open (%s)",
    async (isLightboxOpen) => {
      const props = setup({ isLightboxOpen, reportDetail: undefined });
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      if (isLightboxOpen) expect(props.onOpenChange).not.toHaveBeenCalled();
      else await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false));
    }
  );
});
