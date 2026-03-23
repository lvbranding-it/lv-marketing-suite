import { useOrg } from "./useOrg";

export function usePermissions() {
  const { role } = useOrg();

  const isOwner   = role === "owner";
  const isAdmin   = role === "owner" || role === "admin";
  const isManager = role === "manager";
  const isMember  = role === "member";
  const isManagerOrAbove = isAdmin || isManager;

  return {
    role,
    isOwner,
    isAdmin,
    isManager,
    isMember,
    isManagerOrAbove,
    // Contacts
    canAddContacts:      isAdmin,
    canDeleteContacts:   isAdmin,
    canEditContacts:     true,           // all roles
    canResearchContacts: true,           // all roles
    // Campaigns
    canSendCampaigns:    isManagerOrAbove,
    canApproveCampaigns: isManagerOrAbove,
    canDraftCampaigns:   true,           // all roles
    canDeleteCampaigns:  isAdmin,
    // Settings & Team
    canAccessSettings:   isAdmin,
    canViewActivityLog:  isAdmin,
    canInviteManagers:   isAdmin,
    canInviteMembers:    isManagerOrAbove,
    canRemoveMembers:    isManagerOrAbove,
    // Projects
    canDeleteProjects:   isAdmin,
  };
}
