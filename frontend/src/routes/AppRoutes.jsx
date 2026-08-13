import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import AdminRoute from '../components/AdminRoute';
import StudentRoute from '../components/StudentRoute';
import LoginPage from '../pages/LoginPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import AdminDashboard from '../pages/admin/AdminDashboard';
import StudentsPage from '../pages/admin/StudentsPage';
import BatchesPage from '../pages/admin/BatchesPage';
import MailboxPage from '../pages/mailbox/MailboxPage';
import AdminMeetingsPage from '../pages/meetings/AdminMeetingsPage';
import MeetingsListPage from '../pages/meetings/MeetingsListPage';
import MeetingRoomPage from '../pages/meetings/MeetingRoomPage';
import StudentDashboard from '../pages/student/StudentDashboard';
import StudentAttendanceHistory from '../pages/student/StudentAttendanceHistory';
import ReportsPage from '../pages/admin/ReportsPage';
import ProfilePage from '../pages/ProfilePage';
import StudentAttendancePage from '../pages/admin/StudentAttendancePage';
import BatchDetailPage from '../pages/admin/BatchDetailPage';

// Smart redirect: sends the user to the correct dashboard based on their role
function RootRedirect() {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading || (isAuthenticated && !user)) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'ADMIN') return <Navigate to="/admin/dashboard" replace />;
  return <Navigate to="/student/dashboard" replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Root smart redirect */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Admin-only routes */}
        <Route path="/admin/dashboard" element={
          <AdminRoute><AdminDashboard /></AdminRoute>
        } />
        <Route path="/admin/students" element={
          <AdminRoute><StudentsPage /></AdminRoute>
        } />
        <Route path="/admin/batches" element={
          <AdminRoute><BatchesPage /></AdminRoute>
        } />
        <Route path="/admin/meetings" element={
          <AdminRoute><AdminMeetingsPage /></AdminRoute>
        } />
        <Route path="/admin/reports" element={
          <AdminRoute><ReportsPage /></AdminRoute>
        } />
        <Route path="/admin/students/:id/attendance" element={
          <AdminRoute><StudentAttendancePage /></AdminRoute>
        } />
        <Route path="/admin/batches/:id" element={
          <AdminRoute><BatchDetailPage /></AdminRoute>
        } />

        {/* Student-only routes */}
        <Route path="/student/dashboard" element={
          <StudentRoute><StudentDashboard /></StudentRoute>
        } />
        <Route path="/student/attendance-history" element={
          <StudentRoute><StudentAttendanceHistory /></StudentRoute>
        } />

        {/* Authenticated routes (any role) */}
        <Route path="/mailbox" element={
          <ProtectedRoute><MailboxPage /></ProtectedRoute>
        } />
        <Route path="/meetings" element={
          <ProtectedRoute><MeetingsListPage /></ProtectedRoute>
        } />
        <Route path="/meeting/:id" element={
          <ProtectedRoute><MeetingRoomPage /></ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute><ProfilePage /></ProtectedRoute>
        } />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
