import { Captcha } from "@/components/auth/captcha";
import { ImageCropper } from "@/components/image-cropper";
import { UserSelectionDialog } from "@/components/modals/user-selection-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCreateGroupForm } from "@/hooks/group/use-create-group-form";
import { cn } from "@/lib/utils";
import { User } from "@/types";
import { Camera, Plus, Trash2, Users, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface CreateGroupTabProps {
  activeTab: string;
  form: ReturnType<typeof useCreateGroupForm>;
}

const errorVariants = {
  hidden: { opacity: 0, y: -5, height: 0, marginTop: 0 },
  visible: { opacity: 1, y: 0, height: "auto", marginTop: 8 },
  exit: { opacity: 0, y: -5, height: 0, marginTop: 0 },
};

export const CreateGroupTab = ({ activeTab, form }: CreateGroupTabProps) => {
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtEndRef = useRef(true);

  const {
    groupName,
    setGroupName,
    groupDescription,
    setGroupDescription,
    groupAvatarPreview,
    selectedMembers,
    setSelectedMembers,
    groupErrors,
    isCreatingGroup,
    isPublic,
    setIsPublic,
    cropModalOpen,
    setCropModalOpen,
    selectedImage,
    setSelectedImage,
    groupAvatarInputRef,
    captchaRef,
    handleGroupAvatarChange,
    handleCropComplete,
    handleDeleteGroupAvatar,
    handleCaptchaVerify,
    handleCaptchaError,
    validateGroupField,
    handleCreateGroup,
  } = form;

  const isGroupFormBusy = isCreatingGroup;
  const hasMembers = selectedMembers.length > 0;

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        viewport.scrollLeft += e.deltaY;
      }
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", handleWheel);
    };
  }, [hasMembers]);

  useEffect(() => {
    if (isAtEndRef.current && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [selectedMembers.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollLeft, scrollWidth, clientWidth } = e.currentTarget;
    isAtEndRef.current = Math.abs(scrollWidth - clientWidth - scrollLeft) < 10;
  };

  const handleAddMembers = (users: User[]) => {
    setSelectedMembers((prev) => [...prev, ...users]);
    setAddMemberOpen(false);
  };

  const removeMember = (userId: string) => {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== userId));
  };

  return (
    <TabsContent
      value="create"
      className="absolute inset-0 data-[state=inactive]:hidden flex flex-col min-h-0"
      forceMount={activeTab === "create" ? true : undefined}
    >
      <ScrollArea className="h-full pr-4 -mr-4">
        <div className="grid gap-4 pb-4 pr-1">
          <div className="flex flex-col items-center gap-4">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <div
                  className={cn(
                    "relative group cursor-pointer",
                    isGroupFormBusy && "pointer-events-none opacity-50"
                  )}
                >
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={groupAvatarPreview || undefined} />
                    <AvatarFallback className="text-4xl">
                      <Users className="size-10 text-white" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10" />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" side="bottom" sideOffset={-5} className="z-[100]">
                <DropdownMenuItem onSelect={() => groupAvatarInputRef.current?.click()}>
                  <Camera className="mr-2 h-4 w-4" />
                  {groupAvatarPreview ? "Change Photo" : "Upload Photo"}
                </DropdownMenuItem>
                {groupAvatarPreview && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={handleDeleteGroupAvatar}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Photo
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={groupAvatarInputRef}
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              onChange={handleGroupAvatarChange}
            />
          </div>

          <div className="flex flex-col">
            <Label htmlFor="group-name">Group Name</Label>
            <Input
              id="group-name"
              placeholder="Enter group name"
              value={groupName}
              className="mt-3"
              onChange={(e) => {
                setGroupName(e.target.value);
                validateGroupField("name", e.target.value);
              }}
              disabled={isGroupFormBusy}
            />
            <AnimatePresence mode="wait">
              {groupErrors.name && (
                <motion.p
                  variants={errorVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={{ duration: 0.2 }}
                  className="text-[0.8rem] font-medium text-destructive overflow-hidden"
                >
                  {groupErrors.name}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-col">
            <Label htmlFor="group-description">Description</Label>
            <Textarea
              id="group-description"
              placeholder="Enter group description (optional)"
              value={groupDescription}
              className="resize-none min-h-[80px] max-h-[120px] overflow-y-auto break-words mt-3"
              onChange={(e) => {
                setGroupDescription(e.target.value);
                validateGroupField("description", e.target.value);
              }}
              disabled={isGroupFormBusy}
            />
            <AnimatePresence mode="wait">
              {groupErrors.description && (
                <motion.p
                  variants={errorVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={{ duration: 0.2 }}
                  className="text-[0.8rem] font-medium text-destructive overflow-hidden"
                >
                  {groupErrors.description}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <Label>Public Group</Label>
              <span className="text-xs text-muted-foreground">Anyone can find and join</span>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} disabled={isGroupFormBusy} />
          </div>

          <div className="flex flex-col min-w-0 w-full">
            <div className="flex items-center justify-between">
              <Label>Members ({selectedMembers.length})</Label>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 h-6 w-6 p-0 hover:bg-transparent"
                onClick={() => setAddMemberOpen(true)}
                type="button"
                disabled={isGroupFormBusy}
              >
                <Plus className="size-4 text-muted-foreground hover:text-foreground transition-colors" />
              </Button>
            </div>
            {selectedMembers.length > 0 && (
              <ScrollArea
                className="w-full whitespace-nowrap pt-4"
                viewportRef={scrollRef}
                onScroll={handleScroll}
              >
                <div className="flex gap-2 w-max pr-4">
                  {selectedMembers.map((member) => (
                    <Badge key={member.id} variant="secondary" className="pl-1 pr-1 gap-1">
                      <Avatar className="size-5">
                        <AvatarImage src={member.avatar || undefined} />
                        <AvatarFallback className="text-[10px]">
                          {member.full_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="max-w-[80px] truncate">{member.full_name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-4 hover:bg-destructive/20"
                        onClick={() => removeMember(member.id)}
                        disabled={isGroupFormBusy}
                      >
                        <X className="size-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" className="top-0" />
              </ScrollArea>
            )}
          </div>
          <Button
            className="w-full relative"
            onClick={handleCreateGroup}
            disabled={isGroupFormBusy || !groupName.trim()}
          >
            <span className={isCreatingGroup ? "opacity-0" : ""}>Create Group</span>
            {isCreatingGroup && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner className="h-4 w-4" />
              </div>
            )}
          </Button>
        </div>
      </ScrollArea>

      <ImageCropper
        image={selectedImage}
        open={cropModalOpen}
        onOpenChange={(val) => {
          setCropModalOpen(val);
          if (!val) setSelectedImage(null);
        }}
        onCropComplete={handleCropComplete}
      />

      <UserSelectionDialog
        isOpen={addMemberOpen}
        onClose={setAddMemberOpen}
        onConfirm={handleAddMembers}
        title="Add Members to Group"
        existingMemberIds={selectedMembers.map((m) => m.id)}
        confirmLabel="Add Selected"
      />

      <Captcha
        ref={captchaRef}
        action="group-avatar-upload"
        onVerify={handleCaptchaVerify}
        onError={handleCaptchaError}
      />
    </TabsContent>
  );
};
