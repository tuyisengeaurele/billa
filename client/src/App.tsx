import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { AppLayoutRoute } from "./components/AppLayoutRoute";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/AdminRoute";
import { RootRoute } from "./components/RootRoute";

const Login = lazy(() => import("./pages/Login"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const Register = lazy(() => import("./pages/Register"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Revenue = lazy(() => import("./pages/Revenue"));
const Receivables = lazy(() => import("./pages/Receivables"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerStatement = lazy(() => import("./pages/CustomerStatement"));
const Items = lazy(() => import("./pages/Items"));
const DocumentForm = lazy(() => import("./pages/DocumentForm"));
const Documents = lazy(() => import("./pages/Documents"));
const DocumentView = lazy(() => import("./pages/DocumentView"));
const BusinessSettings = lazy(() => import("./pages/BusinessSettings"));
const Profile = lazy(() => import("./pages/Profile"));
const Notifications = lazy(() => import("./pages/Notifications"));
const BillingCallback = lazy(() => import("./pages/BillingCallback"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const HelpCenter = lazy(() => import("./pages/HelpCenter"));
const Contact = lazy(() => import("./pages/Contact"));
const AdminMessages = lazy(() => import("./pages/AdminMessages"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminUserDetail = lazy(() => import("./pages/admin/AdminUserDetail"));
const AdminBusinesses = lazy(() => import("./pages/admin/AdminBusinesses"));
const AdminBusinessDetail = lazy(() => import("./pages/admin/AdminBusinessDetail"));
const AdminAuditLog = lazy(() => import("./pages/admin/AdminAuditLog"));
const AdminMetrics = lazy(() => import("./pages/admin/AdminMetrics"));
const AdminSystemHealth = lazy(() => import("./pages/admin/AdminSystemHealth"));
const AdminAnnouncements = lazy(() => import("./pages/admin/AdminAnnouncements"));
const AdminProfile = lazy(() => import("./pages/admin/AdminProfile"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications"));
const PublicDocumentView = lazy(() => import("./pages/PublicDocumentView"));
const PublicCustomerPortal = lazy(() => import("./pages/PublicCustomerPortal"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const Activity = lazy(() => import("./pages/Activity"));

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/register" element={<Register />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/help" element={<HelpCenter />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/view/:token" element={<PublicDocumentView />} />
              <Route path="/portal/:token" element={<PublicCustomerPortal />} />
              <Route path="/invite/:token" element={<AcceptInvite />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/onboarding" element={<Onboarding />} />
                <Route element={<AppLayoutRoute />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/revenue" element={<Revenue />} />
                  <Route path="/receivables" element={<Receivables />} />
                  <Route path="/activity" element={<Activity />} />
                  <Route path="/customers" element={<Customers />} />
                  <Route path="/customers/:id/statement" element={<CustomerStatement />} />
                  <Route path="/items" element={<Items />} />
                  <Route path="/documents" element={<Documents />} />
                  <Route path="/documents/new" element={<DocumentForm />} />
                  <Route path="/documents/:id/edit" element={<DocumentForm />} />
                  <Route path="/documents/:id" element={<DocumentView />} />
                  <Route path="/settings" element={<BusinessSettings />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/billing/callback" element={<BillingCallback />} />
                </Route>
              </Route>
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
                <Route path="/admin/metrics" element={<AdminMetrics />} />
                <Route path="/admin/messages" element={<AdminMessages />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/users/:id" element={<AdminUserDetail />} />
                <Route path="/admin/businesses" element={<AdminBusinesses />} />
                <Route path="/admin/businesses/:id" element={<AdminBusinessDetail />} />
                <Route path="/admin/audit-log" element={<AdminAuditLog />} />
                <Route path="/admin/system-health" element={<AdminSystemHealth />} />
                <Route path="/admin/announcements" element={<AdminAnnouncements />} />
                <Route path="/admin/profile" element={<AdminProfile />} />
                <Route path="/admin/notifications" element={<AdminNotifications />} />
              </Route>
              <Route path="/" element={<RootRoute />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
