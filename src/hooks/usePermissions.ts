import { useOrg } from "./useOrg";

export function usePermissions() {
  const { role, branchRole, isBranchOnly, featureAccess } = useOrg();

  const isOwner   = role === "owner";
  const isAdmin   = role === "owner" || role === "admin";
  const isManager = role === "manager";
  const isMember  = role === "member";
  const isManagerOrAbove = isAdmin || isManager;
  const isRegionalCeo = branchRole === "regional_ceo";
  const isBranchManager = branchRole === "manager";
  const canManageBranchTeam = isAdmin || isRegionalCeo || isBranchManager;

  // Admins always have full feature access regardless of feature_access column
  const features = isAdmin || isBranchOnly
    ? { campaigns: true, contacts: true, projects: true, skills: true, intake: true, workspace: true, creativeCanvas: true }
    : featureAccess;

  return {
    role,
    isOwner,
    isAdmin,
    isManager,
    isMember,
    branchRole,
    isBranchOnly,
    isRegionalCeo,
    isBranchManager,
    isManagerOrAbove,
    // Feature access (used to show/hide nav items)
    canAccessCampaigns: features.campaigns !== false,
    canAccessContacts:  features.contacts  !== false,
    canAccessProjects:  features.projects  !== false,
    canAccessWorkspace: features.workspace !== false,
    canAccessSkills:    features.skills    !== false,
    canAccessIntake:    features.intake    !== false,
    // Opt-in, unlike the features above. Creative Canvas spends provider credit
    // on every action, so it is granted per member in team setup rather than
    // being open to anyone who is simply in the organization. The same grant is
    // enforced in `creative_project_role`, so hiding the link is not the gate.
    canAccessCreativeCanvas: (features as Record<string, boolean | undefined>).creativeCanvas === true,
    // Contacts
    canAddContacts:      true,               // all roles can add/import contacts; HQ prospecting tools are gated separately
    canDeleteContacts:   isAdmin,
    canEditContacts:     true,           // all roles
    canResearchContacts: true,           // all roles
    // Campaigns
    canSendCampaigns:    isManagerOrAbove,
    canApproveCampaigns: isManagerOrAbove,
    canDraftCampaigns:   true,           // all roles
    canDeleteCampaigns:  isAdmin,
    // Settings & Team
    canAccessSettings:   isAdmin || isBranchOnly,
    canViewActivityLog:  isAdmin,
    canInviteManagers:   isAdmin,
    canInviteMembers:    isManagerOrAbove,
    canRemoveMembers:    isManagerOrAbove,
    canManageBranchTeam,
    // Projects
    canDeleteProjects:   isAdmin,
  };
}
