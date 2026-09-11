import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader } from 'lucide-react';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import AdminRoute from '../components/AdminRoute';
import StudentRoute from '../components/StudentRoute';
import LoginPage from '../pages/LoginPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';

const AdminDashboard = React.lazy(() => import('../pages/admin/AdminDashboard'));
const StudentsPage = React.lazy(() => import('../pages/admin/StudentsPage'));
const BatchesPage = React.lazy(() => import('../pages/admin/BatchesPage'));
const MailboxPage = React.lazy(() => import('../pages/mailbox/MailboxPage'));
const AdminMeetingsPage = React.lazy(() => import('../pages/meetings/AdminMeetingsPage'));
const MeetingsListPage = React.lazy(() => import('../pages/meetings/MeetingsListPage'));
const MeetingRoomPage = React.lazy(() => import('../pages/meetings/MeetingRoomPage'));
const StudentDashboard = React.lazy(() => import('../pages/student/StudentDashboard'));
const StudentAttendanceHistory = React.lazy(() => import('../pages/student/StudentAttendanceHistory'));
const ReportsPage = React.lazy(() => import('../pages/admin/ReportsPage'));
const ProfilePage = React.lazy(() => import('../pages/ProfilePage'));
const StudentAttendancePage = React.lazy(() => import('../pages/admin/StudentAttendancePage'));
const BatchDetailPage = React.lazy(() => import('../pages/admin/BatchDetailPage'));

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
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', background: 'var(--bg-main)' }}>
        <Loader size={32} color="var(--primary)" className="spin" />
      </div>
    }>
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
    </Suspense>
  );
}
