import React from 'react';
import { Navigate } from 'react-router-dom';

export default function AdminDashboard() {
  return <Navigate to="/admin/profile" replace />;
}
