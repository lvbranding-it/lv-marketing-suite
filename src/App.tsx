import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { OrgProvider } from "@/hooks/useOrg";

// Pages
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import SkillsLibrary from "@/pages/SkillsLibrary";
import SkillRunnerPage from "@/pages/SkillRunnerPage";
import Projects from "@/pages/Projects";
import ProjectDetail from "@/pages/ProjectDetail";
import History from "@/pages/History";
import Settings from "@/pages/Settings";
import Contacts from "@/pages/Contacts";
import Intake from "@/pages/Intake";
import IntakeForm from "@/pages/IntakeForm";

// Lazy pages
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const CampaignComposer = lazy(() => import("@/pages/CampaignComposer"));
const CampaignDetail = lazy(() => import("@/pages/CampaignDetail"));
const Unsubscribe = lazy(() => import("@/pages/Unsubscribe"));

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
      <Route path="/auth" element={<Auth />} />
      <Route path="/intake/:orgId" element={<IntakeForm />} />
      <Route path="/unsubscribe" element={<Suspense fallback={null}><Unsubscribe /></Suspense>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/skills"
        element={
          <ProtectedRoute>
            <SkillsLibrary />
          </ProtectedRoute>
        }
      />
      <Route
        path="/skills/:skillId"
        element={
          <ProtectedRoute>
            <SkillRunnerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <Projects />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:projectId"
        element={
          <ProtectedRoute>
            <ProjectDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          <ProtectedRoute>
            <Contacts />
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
        path="/history"
        element={
          <ProtectedRoute>
            <History />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/intake"
        element={
          <ProtectedRoute>
            <Intake />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <OrgProvider>
              <AppRoutes />
              <Toaster />
            </OrgProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
