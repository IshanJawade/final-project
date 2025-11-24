import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './ThemeProvider';
import { AppShell } from './components/AppShell';
import { Dashboard } from './pages/Dashboard';
import { PatientsPage } from './pages/Patients';
import { CasesPage } from './pages/Cases';
import { AppointmentsPage } from './pages/Appointments';
import { CompliancePage } from './pages/Compliance';

const queryClient = new QueryClient();

export const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/patients" element={<PatientsPage />} />
              <Route path="/cases" element={<CasesPage />} />
              <Route path="/appointments" element={<AppointmentsPage />} />
              <Route path="/compliance" element={<CompliancePage />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
};
