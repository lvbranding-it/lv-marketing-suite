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
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
