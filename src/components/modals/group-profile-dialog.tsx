import { AddMembersDialog } from "@/components/modals/add-members-dialog";
import { EditGroupDialog } from "@/components/modals/edit-group-dialog";
import { MembersTab } from "@/components/modals/group-profile/members-tab";
import { OverviewTab } from "@/components/modals/group-profile/overview-tab";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlobalLightbox } from "@/components/ui/lightbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGroupMemberActions } from "@/hooks/group/use-group-member-actions";
import { useDeleteGroup, useLeaveGroup } from "@/hooks/mutations/use-group";
import { useChat } from "@/hooks/queries";
import { useAuthStore, useChatStore, useUIStore } from "@/store";
import { ChatListItem, GroupMember } from "@/types";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ReportDialog } from "./report-dialog";

interface GroupProfileDialogProps {
  isOpen: boolean;
  onClose: (open: boolean) => void;
  chat: ChatListItem;
}

export function GroupProfileDialog({
  isOpen,
  onClose,
  chat: initialChat,
}: GroupProfileDialogProps) {
  const { data: chatData } = useChat(isOpen ? initialChat.id : null);
  const chat = chatData || initialChat;
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isAvatarLoaded, setIsAvatarLoaded] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [memberSearch, setMemberSearch] = useState("");
  const [debouncedMemberSearch, setDebouncedMemberSearch] = useState("");
  const [isEditGroupOpen, setIsEditGroupOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const openProfileModal = useUIStore((state) => state.openProfileModal);

  const { user: currentUser } = useAuthStore();
  const navigate = useNavigate();
  const setActiveChatId = useChatStore((state) => state.setActiveChatId);

  const { mutate: leaveGroup, isPending: isLeaving } = useLeaveGroup();
  const { mutate: deleteGroup, isPending: isDeleting } = useDeleteGroup();

  const {
    kickCandidate,
    setKickCandidate,
    handlePromoteToAdmin,
    handleDemoteToMember,
    handleTransferOwnership,
    renderConfirmationDialogs,
  } = useGroupMemberActions({
    chatId: chat.id,
    memberSearch: debouncedMemberSearch,
  });

  useEffect(() => {
    if (isOpen) {
      setIsAvatarLoaded(false);
      setActiveTab("overview");
      setMemberSearch("");
      setIsEditGroupOpen(false);
    }
  }, [isOpen, chat.id]);

  const handleLeaveGroup = () => {
    setActiveChatId(null);
    leaveGroup(chat.id, {
      onSuccess: () => {
        onClose(false);
        setTimeout(() => {
          navigate("/");
        }, 300);
      },
    });
  };

  const handleDeleteGroup = () => {
    setActiveChatId(null);
    deleteGroup(
      { chatId: chat.id, name: chat.name },
      {
        onSuccess: () => {
          onClose(false);
          setTimeout(() => {
            navigate("/");
          }, 300);
        },
      }
    );
  };

  const handleViewMemberProfile = (member: GroupMember) => {
    openProfileModal(member.user_id);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(val) => !isLeaving && onClose(val)}>
        <DialogContent
          size="default"
          className="max-h-[85vh] flex flex-col"
          onInteractOutside={(e) =>
            (isLightboxOpen ||
              isLeaveConfirmOpen ||
              kickCandidate ||
              isAddMemberOpen ||
              isEditGroupOpen) &&
            e.preventDefault()
          }
          onEscapeKeyDown={(e) =>
            (isLightboxOpen ||
              isLeaveConfirmOpen ||
              kickCandidate ||
              isAddMemberOpen ||
              isEditGroupOpen) &&
            e.preventDefault()
          }
        >
          <DialogHeader>
            <DialogTitle>Group Info</DialogTitle>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full flex-1 flex flex-col"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="members">Members</TabsTrigger>
            </TabsList>

            <OverviewTab
              activeTab={activeTab}
              chat={chat}
              isAvatarLoaded={isAvatarLoaded}
              setIsAvatarLoaded={setIsAvatarLoaded}
              onAvatarClick={() => chat.avatar && isAvatarLoaded && setIsLightboxOpen(true)}
              onEditGroup={() => setIsEditGroupOpen(true)}
              onLeaveGroup={() => setIsLeaveConfirmOpen(true)}
              onDeleteGroup={() => setIsLeaveConfirmOpen(true)}
              onReportGroup={() => setIsReportOpen(true)}
            />

            <MembersTab
              activeTab={activeTab}
              chat={chat}
              isOpen={isOpen}
              memberSearch={memberSearch}
              setMemberSearch={setMemberSearch}
              debouncedMemberSearch={debouncedMemberSearch}
              setDebouncedMemberSearch={setDebouncedMemberSearch}
              currentUser={currentUser}
              onAddMember={() => setIsAddMemberOpen(true)}
              onViewProfile={handleViewMemberProfile}
              onPromote={handlePromoteToAdmin}
              onDemote={handleDemoteToMember}
              onTransfer={handleTransferOwnership}
              onKick={setKickCandidate}
            />
          </Tabs>
        </DialogContent>
      </Dialog>

      <GlobalLightbox
        open={isLightboxOpen}
        close={() => setIsLightboxOpen(false)}
        slides={chat.avatar ? [{ src: chat.avatar, alt: chat.name }] : []}
      />

      <ConfirmationDialog
        open={isLeaveConfirmOpen}
        onOpenChange={setIsLeaveConfirmOpen}
        title={chat.my_role === "owner" ? "Delete Group?" : "Leave Group?"}
        description={
          chat.my_role === "owner"
            ? `Are you sure you want to delete "${chat.name}"? This action cannot be undone and all data will be lost.`
            : `Are you sure you want to leave "${chat.name}"? You won't be able to see message history or send messages.`
        }
        confirmText={chat.my_role === "owner" ? "Delete Group" : "Leave"}
        cancelText="Cancel"
        variant="destructive"
        onConfirm={chat.my_role === "owner" ? handleDeleteGroup : handleLeaveGroup}
        isLoading={chat.my_role === "owner" ? isDeleting : isLeaving}
      />

      {renderConfirmationDialogs()}

      <AddMembersDialog
        isOpen={isAddMemberOpen}
        onClose={setIsAddMemberOpen}
        groupId={chat.id}
        existingMemberIds={[]}
      />

      <EditGroupDialog isOpen={isEditGroupOpen} onClose={setIsEditGroupOpen} chat={chat} />
      <ReportDialog
        isOpen={isReportOpen}
        onClose={setIsReportOpen}
        targetType="group"
        targetId={chat.id}
        targetName={chat.name}
      />
    </>
  );
}
