import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { isChatMuted, useNotificationPreferences } from "@/lib/notification-preferences";
import { toast } from "@/lib/toast";
import { Bell, BellOff, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
export function ChatNotificationItems({
  chatID,
  onOpenMobile,
  mobileOpen,
  onBack,
}: {
  chatID: string;
  onOpenMobile?: () => void;
  mobileOpen?: boolean;
  onBack?: () => void;
}) {
  const prefs = useNotificationPreferences();
  const [busy, setBusy] = useState(false);
  const muted = isChatMuted(prefs.chats.find((m) => m.chat_id === chatID));
  const [displayedMuted, setDisplayedMuted] = useState(muted);
  const update = async (duration: "off" | "forever" | 1 | 8) => {
    setBusy(true);
    try {
      await prefs.setMute(chatID, duration);
    } catch {
      toast.error("Could not update chat notifications");
    } finally {
      setBusy(false);
    }
  };
  const choices = displayedMuted ? (
    <DropdownMenuItem onSelect={() => void update("off")}>Unmute notifications</DropdownMenuItem>
  ) : (
    ([1, 8, "forever"] as const).map((d) => (
      <DropdownMenuItem key={d} onSelect={() => void update(d)}>
        {d === "forever"
          ? "Mute until I turn it back on"
          : `Mute for ${d} hour${d === 1 ? "" : "s"}`}
      </DropdownMenuItem>
    ))
  );
  if (onOpenMobile) {
    return mobileOpen ? (
      <>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onBack?.();
          }}
        >
          <ChevronLeft className="size-4" />
          Back
        </DropdownMenuItem>
        {choices}
      </>
    ) : (
      <DropdownMenuItem
        disabled={busy || !prefs.loaded}
        onSelect={(event) => {
          event.preventDefault();
          setDisplayedMuted(muted);
          onOpenMobile();
        }}
      >
        {muted ? <BellOff className="size-4" /> : <Bell className="size-4" />}
        <span>Notifications</span>
        <ChevronRight className="ml-auto size-4" />
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuSub
      onOpenChange={(open) => {
        if (open) setDisplayedMuted(muted);
      }}
    >
      <DropdownMenuSubTrigger
        disabled={busy || !prefs.loaded}
        className="gap-2 pr-2 [&>svg:last-child]:ml-4"
      >
        {muted ? (
          <BellOff className="mr-2 size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Bell className="mr-2 size-4 shrink-0 text-muted-foreground" />
        )}
        <span>Notifications</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent sideOffset={6} className="min-w-52">
          {choices}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

export function ChatNotificationStatus({ chatID }: { chatID: string }) {
  const prefs = useNotificationPreferences();
  if (!prefs.loaded) return null;
  const muted = isChatMuted(prefs.chats.find((m) => m.chat_id === chatID));
  const label = muted ? "Notifications muted" : "Notifications on";
  return (
    <span
      title={label}
      role="img"
      aria-label={label}
      className="inline-flex shrink-0 text-muted-foreground"
    >
      {muted ? <BellOff className="size-3.5" /> : <Bell className="size-3.5 opacity-60" />}
    </span>
  );
}
