import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import AdminRoute from '../components/AdminRoute';
import StudentRoute from '../components/StudentRoute';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import AdminDashboard from '../pages/admin/AdminDashboard';
import StudentsPage from '../pages/admin/StudentsPage';
import BatchesPage from '../pages/admin/BatchesPage';
import MailboxPage from '../pages/mailbox/MailboxPage';
import AdminMeetingsPage from '../pages/meetings/AdminMeetingsPage';
import MeetingsListPage from '../pages/meetings/MeetingsListPage';
import MeetingRoomPage from '../pages/meetings/MeetingRoomPage';
import StudentDashboard from '../pages/student/StudentDashboard';
import ReportsPage from '../pages/admin/ReportsPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />

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

        {/* Student-only routes */}
        <Route path="/student/dashboard" element={
          <StudentRoute><StudentDashboard /></StudentRoute>
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

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
