import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function ChatHeaderSkeleton() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  return (
    <header className="border-b dark:border-[#212224] border-[#e4e4e7] z-50 bg-background flex h-[63px] shrink-0 items-center gap-2">
      <div className="flex gap-2 px-4 w-full justify-between items-center">
        <div className="flex items-center justify-center gap-2">
          {isMobile ? (
            <Button
              type="button"
              aria-label="Back to chats"
              variant="outline"
              size="icon"
              onClick={() => navigate("/chat")}
              className="mr-1 size-8"
            >
              <ArrowLeft className="size-4" />
            </Button>
          ) : (
            <SidebarTrigger className="mr-1" />
          )}

          <div className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-full" />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <Skeleton className="h-[13px] w-32 mb-1" />
              <Skeleton className="h-[13px] w-24 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
