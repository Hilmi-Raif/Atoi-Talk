import { X } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="driver-page-interactive pointer-events-none fixed inset-0 z-[2147483647]"
      data-toast-layer
    >
      <Sonner
        theme={theme as ToasterProps["theme"]}
        className="toaster group"
        closeButton
        visibleToasts={1}
        icons={{
          close: <X className="w-4 h-4" />,
        }}
        duration={2000}
        toastOptions={{
          classNames: {
            toast:
              "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg font-sans !w-fit !max-w-[85vw] !mx-auto !left-0 !right-0 !flex !items-center !justify-center !py-3 !px-4 !pointer-events-auto",
            title: "w-full text-center justify-center flex",
            description:
              "group-[.toast]:text-muted-foreground w-full text-center justify-center flex",
            actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
            cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
            closeButton:
              "!relative !left-auto !right-auto !top-auto !transform-none !bg-transparent !border-none !pt-[1px] !size-4 !p-0 hover:!bg-transparent group-[.toast]:text-foreground/50 hover:group-[.toast]:text-foreground transition-colors !order-last",
          },
        }}
        style={
          {
            zIndex: 2147483647,
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
          } as React.CSSProperties
        }
        {...props}
      />
    </div>,
    document.body
  );
};

export { Toaster };
