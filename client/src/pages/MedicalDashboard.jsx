import React from 'react';
import { Navigate } from 'react-router-dom';

export default function MedicalDashboard() {
  return <Navigate to="/medical/profile" replace />;
}
