import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage, RegisterPage } from "./pages/auth.jsx";
import {
  StudentDashboard,
  StudentNotifications,
  StudentProfile,
  StudentRequests,
  StudentSheets,
} from "./pages/student.jsx";
import {
  FacultyComplaints,
  FacultyDashboard,
  FacultyHistory,
  FacultySheets,
  FacultyUpload,
} from "./pages/faculty.jsx";
import {
  AdminAnswerSheets,
  AdminDashboard,
  AdminExaminations,
  AdminFaculty,
  AdminStudents,
} from "./pages/admin.jsx";
import { FacultySheetPage, StudentComplaintPage, StudentSheetPage } from "./pages/viewer.jsx";

function ProtectedRoute({ user, role, children }) {
  if (!user) return <Navigate to="/" replace />;
  if (role && user.role !== role) return <Navigate to={`/${user.role}/dashboard`} replace />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("scbe-user") || "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem("scbe-user", JSON.stringify(user));
    } else {
      localStorage.removeItem("scbe-user");
    }
  }, [user]);

  return (
    <Routes>
      <Route
        path="/"
        element={user ? <Navigate to={`/${user.role}/dashboard`} replace /> : <LoginPage onLogin={setUser} />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to={`/${user.role}/dashboard`} replace /> : <RegisterPage onLogin={setUser} />}
      />

      <Route
        path="/student/dashboard"
        element={
          <ProtectedRoute user={user} role="student">
            <StudentDashboard user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/sheets"
        element={
          <ProtectedRoute user={user} role="student">
            <StudentSheets user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/sheets/:sheetId"
        element={
          <ProtectedRoute user={user} role="student">
            <StudentSheetPage user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/sheets/:sheetId/view"
        element={
          <ProtectedRoute user={user} role="student">
            <StudentSheetPage user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/requests"
        element={
          <ProtectedRoute user={user} role="student">
            <StudentRequests user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/complaints/:complaintId/view"
        element={
          <ProtectedRoute user={user} role="student">
            <StudentComplaintPage user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/notifications"
        element={
          <ProtectedRoute user={user} role="student">
            <StudentNotifications user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/profile"
        element={
          <ProtectedRoute user={user} role="student">
            <StudentProfile user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />

      <Route
        path="/faculty/dashboard"
        element={
          <ProtectedRoute user={user} role="faculty">
            <FacultyDashboard user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faculty/sheets"
        element={
          <ProtectedRoute user={user} role="faculty">
            <FacultySheets user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faculty/upload"
        element={
          <ProtectedRoute user={user} role="faculty">
            <FacultyUpload user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faculty/complaints"
        element={
          <ProtectedRoute user={user} role="faculty">
            <FacultyComplaints user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faculty/history"
        element={
          <ProtectedRoute user={user} role="faculty">
            <FacultyHistory user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faculty/sheets/:sheetId"
        element={
          <ProtectedRoute user={user} role="faculty">
            <FacultySheetPage user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faculty/sheets/:sheetId/view"
        element={
          <ProtectedRoute user={user} role="faculty">
            <FacultySheetPage user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute user={user} role="admin">
            <AdminDashboard user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/students"
        element={
          <ProtectedRoute user={user} role="admin">
            <AdminStudents user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/faculty"
        element={
          <ProtectedRoute user={user} role="admin">
            <AdminFaculty user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/examinations"
        element={
          <ProtectedRoute user={user} role="admin">
            <AdminExaminations user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/answer-sheets"
        element={
          <ProtectedRoute user={user} role="admin">
            <AdminAnswerSheets user={user} onLogout={() => setUser(null)} />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
