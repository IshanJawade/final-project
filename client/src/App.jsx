import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterUserPage from './pages/RegisterUserPage.jsx';
import RegisterMedicalPage from './pages/RegisterMedicalPage.jsx';
import UserProfilePage from './pages/UserProfilePage.jsx';
import UserRecordsPage from './pages/UserRecordsPage.jsx';
import UserAccessPage from './pages/UserAccessPage.jsx';
import MedicalProfilePage from './pages/MedicalProfilePage.jsx';
import MedicalPatientsPage from './pages/MedicalPatientsPage.jsx';
import MedicalRequestsPage from './pages/MedicalRequestsPage.jsx';
import AdminProfilePage from './pages/AdminProfilePage.jsx';
import AdminUsersPage from './pages/AdminUsersPage.jsx';
import AdminProfessionalsPage from './pages/AdminProfessionalsPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register/user" element={<RegisterUserPage />} />
          <Route path="/register/medical" element={<RegisterMedicalPage />} />
          <Route
            path="/user/profile"
            element={
              <ProtectedRoute allow={["user"]}>
                <UserProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/records"
            element={
              <ProtectedRoute allow={["user"]}>
                <UserRecordsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/access"
            element={
              <ProtectedRoute allow={["user"]}>
                <UserAccessPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/medical/profile"
            element={
              <ProtectedRoute allow={["medical"]}>
                <MedicalProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/medical/patients"
            element={
              <ProtectedRoute allow={["medical"]}>
                <MedicalPatientsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/medical/requests"
            element={
              <ProtectedRoute allow={["medical"]}>
                <MedicalRequestsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/profile"
            element={
              <ProtectedRoute allow={["admin"]}>
                <AdminProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pending-users"
            element={
              <ProtectedRoute allow={["admin"]}>
                <AdminUsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pending-professionals"
            element={
              <ProtectedRoute allow={["admin"]}>
                <AdminProfessionalsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard/user" element={<Navigate to="/user/profile" replace />} />
          <Route path="/dashboard/medical" element={<Navigate to="/medical/profile" replace />} />
          <Route path="/dashboard/admin" element={<Navigate to="/admin/profile" replace />} />
          <Route
            path="/user"
            element={
              <ProtectedRoute allow={["user"]}>
                <Navigate to="/user/profile" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/medical"
            element={
              <ProtectedRoute allow={["medical"]}>
                <Navigate to="/medical/profile" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allow={["admin"]}>
                <Navigate to="/admin/profile" replace />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Layout>
    </AuthProvider>
  );
}
