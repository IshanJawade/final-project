import React from 'react';
import { Navigate } from 'react-router-dom';

export default function UserDashboard() {
  return <Navigate to="/user/profile" replace />;
}
