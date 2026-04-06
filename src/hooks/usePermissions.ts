import { useOrg } from "./useOrg";

export function usePermissions() {
  const { role, featureAccess } = useOrg();

  const isOwner   = role === "owner";
  const isAdmin   = role === "owner" || role === "admin";
  const isManager = role === "manager";
  const isMember  = role === "member";
  const isManagerOrAbove = isAdmin || isManager;

  // Admins always have full feature access regardless of feature_access column
  const features = isAdmin
    ? { campaigns: true, contacts: true, projects: true, skills: true, intake: true }
    : featureAccess;

  return {
    role,
    isOwner,
    isAdmin,
    isManager,
    isMember,
    isManagerOrAbove,
    // Feature access (used to show/hide nav items)
    canAccessCampaigns: features.campaigns !== false,
    canAccessContacts:  features.contacts  !== false,
    canAccessProjects:  features.projects  !== false,
    canAccessSkills:    features.skills    !== false,
    canAccessIntake:    features.intake    !== false,
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
