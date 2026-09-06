import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useRole();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// Platform-owner gate for the cross-org Admin Console.
function PlatformAdminRoute({ children }: { children: React.ReactNode }) {
  const { isPlatformAdmin, profileLoading } = useAuth();
  if (profileLoading) return null;
  if (!isPlatformAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// Per-org feature gate — redirect to dashboard if the org doesn't have the feature.
function FeatureRoute({ feature, children }: { feature: string; children: React.ReactNode }) {
  const { organization, profileLoading } = useAuth();
  if (profileLoading) return null;
  if (!organization?.features?.[feature]) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Enquiries from "./pages/Enquiries";
import EnquiryDetail from "./pages/EnquiryDetail";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import SettingsPage from "./pages/SettingsPage";
import QuotationConfigPage from "./pages/QuotationConfigPage";
import FollowUps from "./pages/FollowUps";
import Accounts from "./pages/Accounts";
import Intake from "./pages/Intake";
import QuotationBuilder from "./pages/QuotationBuilder";
import NotFound from "./pages/NotFound";
import ConfirmMobilization from "./pages/ConfirmMobilization";
import ResetPassword from "./pages/ResetPassword";
import SiteVisitForm from "./pages/SiteVisitForm";
import Mobilisation from "./pages/Mobilisation";
import GoogleOAuthCallback from "./pages/GoogleOAuthCallback";
import AdminConsole from "./pages/AdminConsole";
import AuditLog from "./pages/AuditLog";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => {
        const status = (error as { status?: number })?.status;
        if (status && status >= 400 && status < 500) return false; // don't retry 4xx (incl. 401)
        return count < 2;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster position="top-right" />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/intake" element={<Intake />} />
            <Route path="/confirm-mobilization" element={<ConfirmMobilization />} />
            <Route path="/site-visit" element={<SiteVisitForm />} />

            {/* Protected routes */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/follow-ups" element={<FollowUps />} />
              <Route path="/mobilisation" element={<FeatureRoute feature="site_visits"><Mobilisation /></FeatureRoute>} />
              <Route path="/enquiries" element={<Enquiries />} />
              <Route path="/enquiries/:id" element={<EnquiryDetail />} />
              <Route path="/enquiries/:id/quotation" element={<QuotationBuilder />} />
              <Route path="/enquiries/:id/quotation/:quotationId" element={<QuotationBuilder />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/clients/:id" element={<ClientDetail />} />
              <Route path="/accounts" element={<FeatureRoute feature="payments"><Accounts /></FeatureRoute>} />
              <Route path="/quotation-config" element={<AdminRoute><FeatureRoute feature="quotations"><QuotationConfigPage /></FeatureRoute></AdminRoute>} />
              <Route path="/audit-log" element={<AdminRoute><AuditLog /></AdminRoute>} />
              <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
              <Route path="/admin" element={<PlatformAdminRoute><AdminConsole /></PlatformAdminRoute>} />
              <Route path="/oauth/google/callback" element={<PlatformAdminRoute><GoogleOAuthCallback /></PlatformAdminRoute>} />
            </Route>

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/not-found" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/not-found" replace />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
