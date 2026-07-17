import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import * as React from "react";

interface ChatSearchInputProps {
  onSearch: (query: string) => void;
  initialValue?: string;
  disabled?: boolean;
}

export function ChatSearchInput({
  onSearch,
  initialValue,
  disabled = false,
}: ChatSearchInputProps) {
  const [value, setValue] = React.useState(initialValue || "");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;

    const newValue = e.target.value;
    setValue(newValue);
    onSearch(newValue);
  };

  return (
    <div className="sticky top-0 z-50 bg-background p-3 border-b group-data-[collapsible=icon]:hidden">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search chats..."
          className="pl-9 h-9 bg-sidebar-accent/50 border-sidebar-border"
          value={value}
          onChange={handleChange}
          disabled={disabled}
          maxLength={100}
        />
      </div>
    </div>
  );
}
