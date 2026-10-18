import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { createElement } from "react";
import { registerSW } from "virtual:pwa-register";

export function registerServiceWorker() {
  let updating = false;
  const update = registerSW({
    immediate: true,
    onNeedReload() {
      toast.info("An app update is ready", {
        id: "app-update",
        duration: Infinity,
        action: createElement(Button, {
          variant: "link",
          className: "ml-auto p-0 h-auto hover:no-underline hover:opacity-80 transition-opacity",
          onClick: () => window.location.reload(),
          children: "Reload",
        }),
      });
    },
    onNeedRefresh() {
      if (updating) return;
      updating = true;
      void update(true);
    },
    onRegisteredSW(_url, registration) {
      void registration?.update().catch(() => undefined);
    },
  });
}
