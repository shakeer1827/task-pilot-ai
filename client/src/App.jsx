import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import GoalCreatePage from './pages/GoalCreatePage';
import PlanningWorkspacePage from './pages/PlanningWorkspacePage';
import ExecutionWorkspacePage from './pages/ExecutionWorkspacePage';
import HistoryPage from './pages/HistoryPage';
import FinalReportPage from './pages/FinalReportPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/goals/new"
            element={
              <ProtectedRoute>
                <GoalCreatePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/plans/:planId"
            element={
              <ProtectedRoute>
                <PlanningWorkspacePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/executions/:executionId"
            element={
              <ProtectedRoute>
                <ExecutionWorkspacePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <HistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/:executionId"
            element={
              <ProtectedRoute>
                <FinalReportPage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
