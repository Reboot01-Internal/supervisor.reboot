import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth";
import LoginPage from "./pages/LoginPage";
import AdminDashboard from "./pages/AdminDashboard";
import SupervisorsPage from "./pages/SupervisorsPage";
import SupervisorFilePage from "./pages/SupervisorFilePage";
import BoardMembersPage from "./pages/BoardMembersPage";
import BoardPage from "./pages/BoardPage";
import AdminBoardsPage from "./pages/AdminBoardsPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AssignPage from "./pages/AssignPage";
import ProfilePage from "./pages/ProfilePage";
import AdminReportsPage from "./pages/AdminReportsPage";
import MeetingsCalendarPage from "./pages/MeetingsCalendarPage";
import NotificationsPage from "./pages/NotificationsPage";
import BoardMeetingsPage from "./pages/BoardMeetingsPage";
import type { ReactNode } from "react";

function RequireAuth({ children }: { children: ReactNode }) {
  const { authenticated } = useAuth();
  if (!authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { authenticated, isAdmin } = useAuth();
  if (!authenticated) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/admin/boards" />;
  return <>{children}</>;
}

function RequireBoardsAccess({ children }: { children: ReactNode }) {
  const { authenticated, role } = useAuth();
  if (!authenticated) return <Navigate to="/login" replace />;
  if (role !== "admin" && role !== "supervisor" && role !== "student") {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function RequireManageBoards({ children }: { children: ReactNode }) {
  const { authenticated, isAdmin, isSupervisor } = useAuth();
  if (!authenticated) return <Navigate to="/login" replace />;
  if (!isAdmin && !isSupervisor) return <Navigate to="/admin/boards" />;
  return <>{children}</>;
}

function AdminRoute() {
  const { isAdmin } = useAuth();
  if (isAdmin) return <AdminDashboard />;
  return <Navigate to="/admin/boards" />;
}

function CatchAll() {
  const { authenticated, isAdmin } = useAuth();
  if (!authenticated) return <Navigate to="/login" replace />;
  if (isAdmin) return <Navigate to="/admin" />;
  return <Navigate to="/admin/boards" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Navigate to="/admin/boards" />
          </RequireAuth>
        }
      />

      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminRoute />
          </RequireAuth>
        }
      />

      <Route
        path="/admin/supervisors"
        element={<RequireAdmin><SupervisorsPage /></RequireAdmin>}
      />

      <Route
        path="/admin/files/:fileId"
        element={<RequireManageBoards><SupervisorFilePage /></RequireManageBoards>}
      />

      <Route
        path="/workspace"
        element={<RequireManageBoards><SupervisorFilePage /></RequireManageBoards>}
      />

      <Route
        path="/admin/boards"
        element={<RequireBoardsAccess><AdminBoardsPage /></RequireBoardsAccess>}
      />

      <Route
        path="/admin/users"
        element={<RequireAdmin><AdminUsersPage /></RequireAdmin>}
      />

      <Route
        path="/admin/users/:userId/profile"
        element={<RequireAdmin><ProfilePage /></RequireAdmin>}
      />

      <Route
        path="/admin/boards/:boardId"
        element={<RequireBoardsAccess><BoardPage /></RequireBoardsAccess>}
      />

      <Route
        path="/admin/boards/:boardId/members"
        element={<RequireManageBoards><BoardMembersPage /></RequireManageBoards>}
      />

      <Route
        path="/admin/boards/:boardId/meetings"
        element={<RequireAdmin><BoardMeetingsPage /></RequireAdmin>}
      />

      <Route
        path="/admin/assign"
        element={<RequireAdmin><AssignPage /></RequireAdmin>}
      />

      <Route
        path="/admin/reports"
        element={<RequireAdmin><AdminReportsPage /></RequireAdmin>}
      />

      <Route
        path="/admin/meetings"
        element={<RequireBoardsAccess><MeetingsCalendarPage /></RequireBoardsAccess>}
      />

      <Route
        path="/calendar"
        element={<RequireBoardsAccess><MeetingsCalendarPage /></RequireBoardsAccess>}
      />

      <Route
        path="/notifications"
        element={<RequireBoardsAccess><NotificationsPage /></RequireBoardsAccess>}
      />

      <Route
        path="/profile"
        element={<RequireBoardsAccess><ProfilePage /></RequireBoardsAccess>}
      />

      <Route
        path="/profile/:userId"
        element={<RequireBoardsAccess><ProfilePage /></RequireBoardsAccess>}
      />

      <Route path="*" element={<CatchAll />} />
    </Routes>
  );
}
