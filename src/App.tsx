import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { OrgProvider } from "@/hooks/useOrg";
import { LanguageProvider } from "@/hooks/useLanguage";

// Pages
const Auth                 = lazy(() => import("@/pages/Auth"));
const Dashboard            = lazy(() => import("@/pages/Dashboard"));
const SkillsLibrary        = lazy(() => import("@/pages/SkillsLibrary"));
const SkillRunnerPage      = lazy(() => import("@/pages/SkillRunnerPage"));
const Projects             = lazy(() => import("@/pages/Projects"));
const ProjectDetail        = lazy(() => import("@/pages/ProjectDetail"));
const History              = lazy(() => import("@/pages/History"));
const Settings             = lazy(() => import("@/pages/Settings"));
const Contacts             = lazy(() => import("@/pages/Contacts"));
const Intake               = lazy(() => import("@/pages/Intake"));
const IntakeForm           = lazy(() => import("@/pages/IntakeForm"));
const OutputDetail         = lazy(() => import("@/pages/OutputDetail"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const CampaignComposer = lazy(() => import("@/pages/CampaignComposer"));
const CampaignDetail = lazy(() => import("@/pages/CampaignDetail"));
const Workspace = lazy(() => import("@/pages/Workspace"));
const Unsubscribe   = lazy(() => import("@/pages/Unsubscribe"));
const AcceptInvite  = lazy(() => import("@/pages/AcceptInvite"));
const PhotoSessions        = lazy(() => import("@/pages/PhotoSessions"));
const PhotoSessionDetail   = lazy(() => import("@/pages/PhotoSessionDetail"));
const ClientPhotoSelection = lazy(() => import("@/pages/ClientPhotoSelection"));
const FileDrop             = lazy(() => import("@/pages/FileDrop"));
const ClientUpload         = lazy(() => import("@/pages/ClientUpload"));
const Contests             = lazy(() => import("@/pages/Contests"));
const ContestDetail        = lazy(() => import("@/pages/ContestDetail"));
const VotingPage           = lazy(() => import("@/pages/VotingPage"));
const EmbedWidget          = lazy(() => import("@/pages/EmbedWidget"));
const AgentWorkspace         = lazy(() => import("@/pages/AgentWorkspace"));
const FileDownload           = lazy(() => import("@/pages/FileDownload"));
const EventExperiences       = lazy(() => import("@/pages/EventExperiences"));
const EventExperienceEditor  = lazy(() => import("@/pages/EventExperienceEditor"));
const EventPhotoModeration   = lazy(() => import("@/pages/EventPhotoModeration"));
const EventUploadPage        = lazy(() => import("@/pages/EventUploadPage"));
const EventLiveScreen        = lazy(() => import("@/pages/EventLiveScreen"));
const ImageStudio            = lazy(() => import("@/pages/ImageStudio"));
const MotionPalette          = lazy(() => import("@/pages/MotionPalette"));
const QrGenerator            = lazy(() => import("@/pages/QrGenerator"));
const SignatureGenerator     = lazy(() => import("@/pages/SignatureGenerator"));
const CampaignCalculator     = lazy(() => import("@/pages/CampaignCalculator"));
const CampaignCalculatorEs = lazy(() => import("@/pages/es/CampaignCalculatorEs"));
const WebsiteOpportunityAudit = lazy(() => import("@/pages/WebsiteOpportunityAudit"));
const NotFound               = lazy(() => import("@/pages/NotFound"));
const AvEventProduction      = lazy(() => import("@/pages/AvEventProduction"));
const WebSolutionsLead       = lazy(() => import("@/pages/WebSolutionsLead"));
const UxUiDesignLead         = lazy(() => import("@/pages/UxUiDesignLead"));
const CreativeContentLead    = lazy(() => import("@/pages/CreativeContentLead"));
const PhotoVideoLead         = lazy(() => import("@/pages/PhotoVideoLead"));
const BrandStrategyLead      = lazy(() => import("@/pages/BrandStrategyLead"));
const DigitalMarketingLead   = lazy(() => import("@/pages/DigitalMarketingLead"));
const LeadForms              = lazy(() => import("@/pages/LeadForms"));
const AvEventProductionEs    = lazy(() => import("@/pages/es/AvEventProductionEs"));
const WebSolutionsLeadEs     = lazy(() => import("@/pages/es/WebSolutionsLeadEs"));
const UxUiDesignLeadEs       = lazy(() => import("@/pages/es/UxUiDesignLeadEs"));
const CreativeContentLeadEs  = lazy(() => import("@/pages/es/CreativeContentLeadEs"));
const PhotoVideoLeadEs       = lazy(() => import("@/pages/es/PhotoVideoLeadEs"));
const BrandStrategyLeadEs    = lazy(() => import("@/pages/es/BrandStrategyLeadEs"));
const DigitalMarketingLeadEs = lazy(() => import("@/pages/es/DigitalMarketingLeadEs"));
// Creative Collaboration Standard (CCS)
const CcsDashboard           = lazy(() => import("@/pages/ccs/CcsDashboard"));
const CcsClients             = lazy(() => import("@/pages/ccs/CcsClients"));
const CcsClientDetail        = lazy(() => import("@/pages/ccs/CcsClientDetail"));
const CcsProjects            = lazy(() => import("@/pages/ccs/CcsProjects"));
const CcsProjectDetail       = lazy(() => import("@/pages/ccs/CcsProjectDetail"));
const CcsRequestBuilder      = lazy(() => import("@/pages/ccs/CcsRequestBuilder"));
const CcsRequestReview       = lazy(() => import("@/pages/ccs/CcsRequestReview"));
const CcsRequestDocument     = lazy(() => import("@/pages/ccs/CcsRequestDocument"));
const CcsReviewWizard        = lazy(() => import("@/pages/review/CcsReviewWizard"));
const CcsReviewDocument      = lazy(() => import("@/pages/review/CcsReviewDocument"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function WebsiteAuditLocaleRedirectRoute() {
  let language = "en";
  try {
    const stored = localStorage.getItem("lv-website-opportunity-audit:language");
    language = stored === "es" || (!stored && navigator.language.toLowerCase().startsWith("es")) ? "es" : "en";
  } catch { /* English is the safe default */ }
  const landing = language === "es" ? "/es/tools/auditoria-de-oportunidades-web" : "/en/tools/website-opportunity-audit";
  return <Navigate to={`${landing}${window.location.search}`} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<Suspense fallback={null}><Auth /></Suspense>} />
      <Route path="/intake/:orgId" element={<Suspense fallback={null}><IntakeForm /></Suspense>} />
      <Route path="/unsubscribe"   element={<Suspense fallback={null}><Unsubscribe /></Suspense>} />
      <Route path="/accept-invite" element={<Suspense fallback={null}><AcceptInvite /></Suspense>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><Dashboard /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/skills"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><SkillsLibrary /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/skills/:skillId"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><SkillRunnerPage /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><Projects /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:projectId"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><ProjectDetail /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/workspace"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><Workspace /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><Contacts /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/campaigns"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><Campaigns /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/campaigns/new"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><CampaignComposer /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/campaigns/:id"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><CampaignDetail /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/outputs/:outputId"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><OutputDetail /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/outputs"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><History /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><History /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><Settings /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/intake"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><Intake /></Suspense>
          </ProtectedRoute>
        }
      />
      {/* PhotoSelector Pro — photographer (protected) */}
      <Route
        path="/photo-sessions"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><PhotoSessions /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/photo-sessions/:sessionId"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><PhotoSessionDetail /></Suspense>
          </ProtectedRoute>
        }
      />
      {/* PhotoSelector Pro — public client view (no auth) */}
      <Route
        path="/share/:shareToken"
        element={<Suspense fallback={null}><ClientPhotoSelection /></Suspense>}
      />
      {/* Lead Forms directory — agency (protected) */}
      <Route
        path="/lead-forms"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><LeadForms /></Suspense>
          </ProtectedRoute>
        }
      />
      {/* File Drop — agency (protected) */}
      <Route
        path="/files"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><FileDrop /></Suspense>
          </ProtectedRoute>
        }
      />
      {/* File Drop — public client upload (no auth) */}
      <Route
        path="/upload/:token"
        element={<Suspense fallback={null}><ClientUpload /></Suspense>}
      />
      {/* File Share — public client download (no auth) */}
      <Route
        path="/download/:token"
        element={<Suspense fallback={null}><FileDownload /></Suspense>}
      />
      {/* Motion Palette — internal Lottie recoloring tool (protected) */}
      <Route
        path="/motion-palette"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><MotionPalette /></Suspense>
          </ProtectedRoute>
        }
      />
      {/* Image Studio — public in-browser image framing tool (no auth) */}
      <Route path="/image-studio" element={<Suspense fallback={null}><ImageStudio /></Suspense>} />
      {/* QR Generator — public in-browser QR code tool (no auth) */}
      <Route path="/qr-generator" element={<Suspense fallback={null}><QrGenerator /></Suspense>} />
      {/* Email Signature Generator — public in-browser tool (no auth) */}
      <Route path="/email-signature-generator" element={<Suspense fallback={null}><SignatureGenerator /></Suspense>} />
      {/* Campaign Investment Calculator — public planning tool (no auth) */}
      <Route path="/campaign-investment-calculator" element={<Suspense fallback={null}><CampaignCalculator /></Suspense>} />
      {/* Website Opportunity Audit — public bilingual tool (no auth) */}
      <Route path="/tools/website-opportunity-audit" element={<WebsiteAuditLocaleRedirectRoute />} />
      <Route path="/en/tools/website-opportunity-audit" element={<Suspense fallback={null}><WebsiteOpportunityAudit language="en" phase="landing" /></Suspense>} />
      <Route path="/en/tools/website-opportunity-audit/context" element={<Suspense fallback={null}><WebsiteOpportunityAudit language="en" phase="context" /></Suspense>} />
      <Route path="/en/tools/website-opportunity-audit/analyzing" element={<Suspense fallback={null}><WebsiteOpportunityAudit language="en" phase="analyzing" /></Suspense>} />
      <Route path="/en/tools/website-opportunity-audit/results/:auditId" element={<Suspense fallback={null}><WebsiteOpportunityAudit language="en" phase="results" /></Suspense>} />
      <Route path="/es/tools/auditoria-de-oportunidades-web" element={<Suspense fallback={null}><WebsiteOpportunityAudit language="es" phase="landing" /></Suspense>} />
      <Route path="/es/tools/auditoria-de-oportunidades-web/contexto" element={<Suspense fallback={null}><WebsiteOpportunityAudit language="es" phase="context" /></Suspense>} />
      <Route path="/es/tools/auditoria-de-oportunidades-web/analizando" element={<Suspense fallback={null}><WebsiteOpportunityAudit language="es" phase="analyzing" /></Suspense>} />
      <Route path="/es/tools/auditoria-de-oportunidades-web/resultados/:auditId" element={<Suspense fallback={null}><WebsiteOpportunityAudit language="es" phase="results" /></Suspense>} />
      {/* Service lead wizards — public (no auth) */}
      <Route path="/av-event-production-houston" element={<Suspense fallback={null}><AvEventProduction /></Suspense>} />
      <Route path="/industry-web-solutions-web-app-development" element={<Suspense fallback={null}><WebSolutionsLead /></Suspense>} />
      <Route path="/ux-ui-web-design-user-experiences-web-development" element={<Suspense fallback={null}><UxUiDesignLead /></Suspense>} />
      <Route path="/creative-strategy-content-design-houston" element={<Suspense fallback={null}><CreativeContentLead /></Suspense>} />
      <Route path="/commercial-photography-video-production-houston" element={<Suspense fallback={null}><PhotoVideoLead /></Suspense>} />
      <Route path="/brand-strategy-identity-houston" element={<Suspense fallback={null}><BrandStrategyLead /></Suspense>} />
      <Route path="/digital-marketing-paid-media-houston" element={<Suspense fallback={null}><DigitalMarketingLead /></Suspense>} />
      {/* Spanish forms (es.lvbranding.com) — same CRM, tagged Español */}
      <Route path="/es/av-event-production-houston" element={<Suspense fallback={null}><AvEventProductionEs /></Suspense>} />
      <Route path="/es/industry-web-solutions-web-app-development" element={<Suspense fallback={null}><WebSolutionsLeadEs /></Suspense>} />
      <Route path="/es/ux-ui-web-design-user-experiences-web-development" element={<Suspense fallback={null}><UxUiDesignLeadEs /></Suspense>} />
      <Route path="/es/creative-strategy-content-design-houston" element={<Suspense fallback={null}><CreativeContentLeadEs /></Suspense>} />
      <Route path="/es/commercial-photography-video-production-houston" element={<Suspense fallback={null}><PhotoVideoLeadEs /></Suspense>} />
      <Route path="/es/brand-strategy-identity-houston" element={<Suspense fallback={null}><BrandStrategyLeadEs /></Suspense>} />
      <Route path="/es/digital-marketing-paid-media-houston" element={<Suspense fallback={null}><DigitalMarketingLeadEs /></Suspense>} />
      <Route path="/es/calculadora-de-inversion-en-campanas" element={<Suspense fallback={null}><CampaignCalculatorEs /></Suspense>} />
      {/* Event Experiences — public pages (no auth) */}
      <Route path="/event/:eventSlug/upload"      element={<Suspense fallback={null}><EventUploadPage /></Suspense>} />
      <Route path="/event/:eventSlug/live-screen" element={<Suspense fallback={null}><EventLiveScreen /></Suspense>} />
      {/* Contests — admin (protected) */}
      <Route
        path="/contests"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><Contests /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/contests/:id"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><ContestDetail /></Suspense>
          </ProtectedRoute>
        }
      />
      {/* Voting — public pages (no auth) */}
      <Route
        path="/vote/:slug"
        element={<Suspense fallback={null}><VotingPage /></Suspense>}
      />
      <Route
        path="/vote/:slug/verify"
        element={<Suspense fallback={null}><VotingPage /></Suspense>}
      />
      {/* Embed widget — public iframe results (no auth) */}
      <Route
        path="/embed/:slug"
        element={<Suspense fallback={null}><EmbedWidget /></Suspense>}
      />
      {/* Agent Workspace */}
      <Route
        path="/agents"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><AgentWorkspace /></Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/agents/:projectId"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}><AgentWorkspace /></Suspense>
          </ProtectedRoute>
        }
      />
      {/* Event Experiences — admin (protected) */}
      <Route path="/event-experiences" element={<ProtectedRoute><Suspense fallback={null}><EventExperiences /></Suspense></ProtectedRoute>} />
      <Route path="/event-experiences/:eventId" element={<ProtectedRoute><Suspense fallback={null}><EventExperienceEditor /></Suspense></ProtectedRoute>} />
      <Route path="/event-experiences/:eventId/photos" element={<ProtectedRoute><Suspense fallback={null}><EventPhotoModeration /></Suspense></ProtectedRoute>} />
      {/* Creative Collaboration Standard — client wizard (public, token-gated) */}
      <Route path="/review/:token" element={<Suspense fallback={null}><CcsReviewWizard /></Suspense>} />
      <Route path="/review/:token/document" element={<Suspense fallback={null}><CcsReviewDocument /></Suspense>} />
      {/* Creative Collaboration Standard — admin (protected) */}
      <Route path="/ccs" element={<ProtectedRoute><Suspense fallback={null}><CcsDashboard /></Suspense></ProtectedRoute>} />
      <Route path="/ccs/requests/new" element={<ProtectedRoute><Suspense fallback={null}><CcsRequestBuilder /></Suspense></ProtectedRoute>} />
      <Route path="/ccs/requests/:requestId" element={<ProtectedRoute><Suspense fallback={null}><CcsRequestReview /></Suspense></ProtectedRoute>} />
      <Route path="/ccs/requests/:requestId/document" element={<ProtectedRoute><Suspense fallback={null}><CcsRequestDocument /></Suspense></ProtectedRoute>} />
      <Route path="/ccs/clients" element={<ProtectedRoute><Suspense fallback={null}><CcsClients /></Suspense></ProtectedRoute>} />
      <Route path="/ccs/clients/:clientId" element={<ProtectedRoute><Suspense fallback={null}><CcsClientDetail /></Suspense></ProtectedRoute>} />
      <Route path="/ccs/projects" element={<ProtectedRoute><Suspense fallback={null}><CcsProjects /></Suspense></ProtectedRoute>} />
      <Route path="/ccs/projects/:projectId" element={<ProtectedRoute><Suspense fallback={null}><CcsProjectDetail /></Suspense></ProtectedRoute>} />
      {/* Unmatched routes render a real not-found page. This used to redirect
          to /dashboard, which sent every mistyped public URL to the login screen. */}
      <Route path="*" element={<Suspense fallback={null}><NotFound /></Suspense>} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthProvider>
              <OrgProvider>
                <AppRoutes />
                <Toaster />
              </OrgProvider>
            </AuthProvider>
          </BrowserRouter>
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
