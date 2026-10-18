import { CreateGroupTab } from "@/components/modals/public-group-search/create-group-tab";
import { FindGroupTab } from "@/components/modals/public-group-search/find-group-tab";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCreateGroupForm } from "@/hooks/group/use-create-group-form";
import { useEffect, useState } from "react";

interface PublicGroupSearchDialogProps {
  isOpen: boolean;
  onClose: (open: boolean) => void;
}

export function PublicGroupSearchDialog({ isOpen, onClose }: PublicGroupSearchDialogProps) {
  const [activeTab, setActiveTab] = useState("find");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const form = useCreateGroupForm(onClose);
  const { isCreatingGroup, resetGroupForm } = form;

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setDebouncedSearch("");
      setActiveTab("find");
      resetGroupForm();
    }
  }, [isOpen]);

  const isGroupFormBusy = isCreatingGroup;

  return (
    <Dialog open={isOpen} onOpenChange={onClose} modal={true}>
      <DialogContent
        size="default"
        className={`h-[600px] flex flex-col overflow-hidden ${
          isGroupFormBusy ? "[&>button]:pointer-events-none [&>button]:opacity-50" : ""
        }`}
        onPointerDownOutside={(e) => {
          if (isGroupFormBusy) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isGroupFormBusy) e.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 pb-2">
          <DialogTitle>Groups</DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full flex-1 flex flex-col min-h-0"
        >
          <TabsList
            className={`grid w-full grid-cols-2 shrink-0 ${
              isGroupFormBusy ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <TabsTrigger value="find">Find Group</TabsTrigger>
            <TabsTrigger value="create">Create Group</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden mt-4 relative">
            <FindGroupTab
              activeTab={activeTab}
              search={search}
              setSearch={setSearch}
              debouncedSearch={debouncedSearch}
              setDebouncedSearch={setDebouncedSearch}
              onClose={onClose}
            />

            <CreateGroupTab activeTab={activeTab} form={form} />
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
