import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RootRoute } from "./components/RootRoute";

const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Customers = lazy(() => import("./pages/Customers"));
const Items = lazy(() => import("./pages/Items"));
const DocumentForm = lazy(() => import("./pages/DocumentForm"));
const Documents = lazy(() => import("./pages/Documents"));
const DocumentView = lazy(() => import("./pages/DocumentView"));
const BusinessSettings = lazy(() => import("./pages/BusinessSettings"));
const BillingCallback = lazy(() => import("./pages/BillingCallback"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const HelpCenter = lazy(() => import("./pages/HelpCenter"));
const Contact = lazy(() => import("./pages/Contact"));
const AdminMessages = lazy(() => import("./pages/AdminMessages"));

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/help" element={<HelpCenter />} />
              <Route path="/contact" element={<Contact />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/items" element={<Items />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/documents/new" element={<DocumentForm />} />
                <Route path="/documents/:id/edit" element={<DocumentForm />} />
                <Route path="/documents/:id" element={<DocumentView />} />
                <Route path="/settings" element={<BusinessSettings />} />
                <Route path="/billing/callback" element={<BillingCallback />} />
                <Route path="/admin/messages" element={<AdminMessages />} />
              </Route>
              <Route path="/" element={<RootRoute />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
