import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import BottomNav from './components/Layout/BottomNav.jsx';
import Login from './pages/Login/Login.jsx';
import Profile from './pages/Profile/Profile.jsx';
import Library from './pages/Library/Library.jsx';
import Upload from './pages/Upload/Upload.jsx';
import Quiz from './pages/Quiz/Quiz.jsx';
import Reels from './pages/Reels/Reels.jsx';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/upload" replace /> : <Login />}
        />
        <Route
          path="/upload"
          element={<ProtectedRoute><Upload /></ProtectedRoute>}
        />
        <Route
          path="/library"
          element={<ProtectedRoute><Library /></ProtectedRoute>}
        />
        <Route
          path="/reels"
          element={<ProtectedRoute><Reels /></ProtectedRoute>}
        />
        <Route
          path="/profile"
          element={<ProtectedRoute><Profile /></ProtectedRoute>}
        />
        <Route
          path="/quiz/:id"
          element={<ProtectedRoute><Quiz /></ProtectedRoute>}
        />
        <Route
          path="*"
          element={<Navigate to={isAuthenticated ? '/upload' : '/login'} replace />}
        />
      </Routes>
      {isAuthenticated && <BottomNav />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
