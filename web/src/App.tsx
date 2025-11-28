import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './ThemeProvider';
import { AppShell } from './components/AppShell';
import { Dashboard } from './pages/Dashboard';
import { PatientsPage } from './pages/Patients';
import { CasesPage } from './pages/Cases';
import { CaseDetailPage } from './pages/CaseDetail';
import { AppointmentsPage } from './pages/Appointments';
import { CompliancePage } from './pages/Compliance';
import { AdminStaffPage } from './pages/AdminStaff';
import { DoctorDirectoryPage } from './pages/DoctorDirectory';
import { AuditLogPage } from './pages/AuditLog';
import { LoginPage } from './pages/Login';
import { AuthProvider, useAuth } from './context/AuthContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 15_000,
      retry: 1
    }
  }
});

const LoadingScreen = () => (
  <div className="auth-layout">
    <div className="auth-card">
      <header>
        <h1>Medical Records Command</h1>
        <p>Preparing secure session...</p>
      </header>
    </div>
  </div>
);

const AppContent = () => {
  const { status, user, logout } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status !== 'authenticated' || !user) {
    return <LoginPage />;
  }

  return (
    <AppShell user={user} onLogout={logout}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/patients" element={<PatientsPage />} />
        <Route path="/cases" element={<CasesPage />} />
        <Route path="/cases/:id" element={<CaseDetailPage />} />
        <Route path="/appointments" element={<AppointmentsPage />} />
        <Route path="/doctors" element={<DoctorDirectoryPage />} />
        <Route path="/compliance" element={<CompliancePage />} />
        <Route path="/admin/staff" element={<AdminStaffPage />} />
        <Route path="/admin/audit" element={<AuditLogPage />} />
      </Routes>
    </AppShell>
  );
};

export const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};
