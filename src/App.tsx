import { AuthProvider, useAuth } from './lib/AuthContext';
import LoginPage from './components/LoginPage';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { auth } from './lib/firebase';
import { signOut } from 'firebase/auth';

function AppContent() {
  const { user, loading, userRole } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Welcome back, {user.email}</p>
            <div className="mt-2 inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium uppercase">
              Role: {userRole || 'Pending'}
            </div>
          </div>
          <Button variant="outline" onClick={() => signOut(auth)}>
            Logout
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-white rounded-xl shadow-sm border">
            <h3 className="font-semibold mb-2">Profile</h3>
            <p className="text-sm text-muted-foreground">Manage your account settings and preferences.</p>
          </div>
          <div className="p-6 bg-white rounded-xl shadow-sm border">
            <h3 className="font-semibold mb-2">
              {userRole === 'ngo' ? 'My Opportunities' : 'My Applications'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {userRole === 'ngo' 
                ? 'Create and manage volunteer opportunities.' 
                : 'Track your volunteer applications and status.'}
            </p>
          </div>
          <div className="p-6 bg-white rounded-xl shadow-sm border">
            <h3 className="font-semibold mb-2">Messages</h3>
            <p className="text-sm text-muted-foreground">Connect with {userRole === 'ngo' ? 'volunteers' : 'NGOs'}.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
      <Toaster position="top-center" />
    </AuthProvider>
  );
}
