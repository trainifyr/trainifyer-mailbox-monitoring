import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import HomePage from '../pages/HomePage';
import AdminDashboard from '../pages/admin/AdminDashboard';
import StudentDashboard from '../pages/student/StudentDashboard';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/student/dashboard" element={<StudentDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
