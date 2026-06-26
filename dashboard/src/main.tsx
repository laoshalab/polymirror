import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/ui/Toast";
import { ThemeProvider } from "./components/ui/ThemeProvider";
import { I18nProvider } from "./i18n/I18nProvider";
import { AuthGate, LoginPage } from "./pages/Login";
import { OverviewPage } from "./pages/Overview";
import { LeadersPage } from "./pages/Leaders";
import { LeaderEditPage, LeaderNewPage } from "./pages/LeaderFormPage";
import { ActivityPage } from "./pages/Activity";
import { DiscoverPage } from "./pages/Discover";
import { DiscoverTraderPage } from "./pages/DiscoverTrader";
import { PositionsPage } from "./pages/Positions";
import { OrdersPage } from "./pages/Orders";
import { AccountPage } from "./pages/Account";
import { RiskPage } from "./pages/Risk";
import { SettingsPage } from "./pages/Settings";
import { DocsPage } from "./pages/Docs";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 3000 } },
});

function LeaderEditRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <LeaderEditPage leaderId={id} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <AuthGate>
                <Layout />
              </AuthGate>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="discover" element={<DiscoverPage />} />
            <Route path="discover/trader/:address" element={<DiscoverTraderPage />} />
            <Route path="leaders" element={<LeadersPage />} />
            <Route path="positions" element={<PositionsPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="risk" element={<RiskPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="leaders/new" element={<LeaderNewPage />} />
            <Route path="leaders/:id/edit" element={<LeaderEditRoute />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="docs" element={<DocsPage />} />
            <Route path="docs/:docId" element={<DocsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
            </BrowserRouter>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>
);
