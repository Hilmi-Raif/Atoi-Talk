import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Sidebar,
  SidebarContent,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "../sidebar";

let mobile = false;
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mobile }));

function State() {
  const state = useSidebar();
  return (
    <output>
      {state.state}:{String(state.openMobile)}
    </output>
  );
}
describe("sidebar interaction", () => {
  beforeEach(() => {
    mobile = false;
  });
  afterEach(cleanup);
  it.each([false, true])("keeps a stable loading placeholder width with icon=%s", (showIcon) => {
    const { container, rerender } = render(<SidebarMenuSkeleton showIcon={showIcon} />);
    const text = container.querySelector('[data-sidebar="menu-skeleton-text"]') as HTMLElement;
    const width = text.style.getPropertyValue("--skeleton-width");
    expect(parseInt(width)).toBeGreaterThanOrEqual(50);
    expect(parseInt(width)).toBeLessThan(90);
    expect(Boolean(container.querySelector('[data-sidebar="menu-skeleton-icon"]'))).toBe(showIcon);
    rerender(<SidebarMenuSkeleton showIcon={showIcon} className="updated" />);
    expect(text.style.getPropertyValue("--skeleton-width")).toBe(width);
  });
  it("toggles desktop state and persists the preference without changing mobile state", () => {
    const onClick = vi.fn();
    render(
      <SidebarProvider>
        <State />
        <SidebarTrigger onClick={onClick} />
      </SidebarProvider>
    );
    expect(screen.getByRole("status")).toHaveTextContent("expanded:false");
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    expect(screen.getByRole("status")).toHaveTextContent("collapsed:false");
    expect(document.cookie).toContain("sidebar_state=false");
    expect(onClick).toHaveBeenCalledOnce();
  });
  it("honors a controlled open value and reports changes to its owner", () => {
    const change = vi.fn();
    function Controlled() {
      const [open, setOpen] = useState(false);
      return (
        <SidebarProvider
          open={open}
          onOpenChange={(next) => {
            change(next);
            setOpen(next);
          }}
        >
          <State />
          <SidebarRail />
        </SidebarProvider>
      );
    }
    render(<Controlled />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    expect(change).toHaveBeenCalledWith(true);
    expect(screen.getByRole("status")).toHaveTextContent("expanded:false");
  });
  it.each(["ctrlKey", "metaKey"])(
    "uses %s+B but ignores unmodified keys and removes its listener",
    (modifier) => {
      const remove = vi.spyOn(window, "removeEventListener");
      const view = render(
        <SidebarProvider>
          <State />
        </SidebarProvider>
      );
      fireEvent.keyDown(window, { key: "b" });
      fireEvent.keyDown(window, { key: "x", [modifier]: true });
      expect(screen.getByRole("status")).toHaveTextContent("expanded");
      fireEvent.keyDown(window, { key: "b", [modifier]: true });
      expect(screen.getByRole("status")).toHaveTextContent("collapsed");
      view.unmount();
      expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
      remove.mockRestore();
    }
  );
  it("opens and dismisses the real mobile sheet independently of desktop state", async () => {
    mobile = true;
    render(
      <SidebarProvider>
        <State />
        <SidebarTrigger />
        <Sidebar side="right">
          <p>Mobile conversations</p>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    expect(await screen.findByRole("dialog", { name: "Sidebar" })).toHaveTextContent(
      "Mobile conversations"
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("status")).toHaveTextContent("expanded:false");
  });
  it.each(["sidebar", "floating", "inset"] as const)(
    "preserves right-side %s navigation while collapsed",
    (variant) => {
      const { container } = render(
        <SidebarProvider defaultOpen={false}>
          <Sidebar variant={variant} side="right" collapsible="icon">
            <a href="/chat">Chats</a>
          </Sidebar>
        </SidebarProvider>
      );
      expect(screen.getByRole("link", { name: "Chats" })).toHaveAttribute("href", "/chat");
      expect(container.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
        "data-collapsible",
        "icon"
      );
      expect(container.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
        "data-variant",
        variant
      );
      expect(container.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
        "data-side",
        "right"
      );
    }
  );
  it("supports a noncollapsible mobile navigation region", () => {
    mobile = true;
    render(
      <SidebarProvider>
        <Sidebar collapsible="none">
          <a href="/settings">Settings</a>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByRole("link", { name: "Settings" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("forwards scrolling through its real viewport and preserves semantic slotted navigation", () => {
    const ref = createRef<HTMLDivElement>();
    const onScroll = vi.fn();
    const action = vi.fn();
    render(
      <SidebarProvider>
        <SidebarContent scrollRef={ref} onScroll={onScroll}>
          <SidebarInput aria-label="Find conversation" />
          <SidebarGroupLabel asChild>
            <h2>Conversations</h2>
          </SidebarGroupLabel>
          <SidebarGroupAction asChild>
            <button onClick={action}>Create conversation</button>
          </SidebarGroupAction>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive tooltip={{ children: "Open engineering" }}>
                <a href="/chat/engineering">Engineering</a>
              </SidebarMenuButton>
              <SidebarMenuAction asChild showOnHover>
                <button onClick={action}>Archive</button>
              </SidebarMenuAction>
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild size="sm" isActive>
                    <a href="/thread">Thread</a>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </SidebarProvider>
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Find conversation" }), {
      target: { value: "Ada" },
    });
    expect(screen.getByRole("textbox")).toHaveValue("Ada");
    expect(screen.getByRole("heading", { name: "Conversations" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Engineering" })).toHaveAttribute(
      "data-active",
      "true"
    );
    expect(screen.getByRole("link", { name: "Thread" })).toHaveAttribute("href", "/thread");
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Create conversation" }));
    expect(action).toHaveBeenCalledTimes(2);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    fireEvent.scroll(ref.current!);
    expect(onScroll).toHaveBeenCalledOnce();
  });
});
