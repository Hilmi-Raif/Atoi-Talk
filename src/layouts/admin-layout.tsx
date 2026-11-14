import { AdminSidebar } from "@/components/layouts/admin-sidebar";
import { ModeToggle } from "@/components/mode-toggle.tsx";

import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Suspense, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";

export default function AdminLayout() {
  const location = useLocation();

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement;
    if (viewport) {
      viewport.scrollTop = 0;
    }
  }, [location.pathname]);

  return (
    <SidebarProvider style={{ "--sidebar-width": "16rem" } as React.CSSProperties}>
      <div className="flex min-h-screen w-full bg-muted/40">
        <AdminSidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="border-b dark:border-[#212224] border-[#e4e4e7] z-50 bg-background flex h-[63px] shrink-0 items-center gap-2">
            <div className="flex gap-2 px-4 w-full justify-between items-center">
              <div className="flex items-center justify-center gap-2">
                <SidebarTrigger className="mr-1" />
              </div>
              <div className="flex items-center gap-2">
                <ModeToggle />
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-hidden">
            <ScrollArea ref={scrollAreaRef} className="h-full w-full">
              <div className="flex flex-col min-h-[calc(100vh-64px)]">
                <div className="flex-1">
                  <Suspense fallback={null}>
                    <div className="p-6">
                      <Outlet />
                    </div>
                  </Suspense>
                </div>
                <footer className="w-full flex flex-col items-center md:items-end justify-center py-4 px-6 bg-background border-t mt-auto text-center md:text-right">
                  <p className="text-sm text-muted-foreground">
                    AtoiTalk © {new Date().getFullYear()} All Rights Reserved
                  </p>
                </footer>
              </div>
            </ScrollArea>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
