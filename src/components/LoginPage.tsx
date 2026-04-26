import { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup,
  signOut 
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/src/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { LogIn, UserPlus, Mail, Lock, Heart, Building2, Chrome, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [role, setRoleState] = useState<'ngo' | 'volunteer' | null>(() => {
    return localStorage.getItem('onboarding_role') as any;
  });

  const setRole = (newRole: 'ngo' | 'volunteer' | null) => {
    setRoleState(newRole);
    if (newRole) {
      localStorage.setItem('onboarding_role', newRole);
    } else {
      localStorage.removeItem('onboarding_role');
    }
  };

  // Logic to handle "Logged in but no doc"
  useEffect(() => {
    const completeOnboarding = async () => {
      const user = auth.currentUser;
      if (user && role && !loading) {
        setLoading(true);
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (!userDoc.exists()) {
            console.log("Creating missing user doc for:", user.uid, role);
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
              role: role,
              impactPoints: 0,
              totalPoints: 0,
              earnedBadges: [],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            toast.success("Profile setup complete!");
          }
        } catch (err) {
          console.error("Auto-onboarding error:", err);
        } finally {
          setLoading(false);
        }
      }
    };

    completeOnboarding();
  }, [role]);

  const handleEmailAuth = async (type: 'login' | 'signup') => {
    if (!role) {
      toast.error("Please select if you are an NGO or a Volunteer first.");
      return;
    }
    if (!email || !password) {
      toast.error("Please fill in all fields.");
      return;
    }

    setLoading(true);
    try {
      let userCredential;
      if (type === 'signup') {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Create user profile
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          role: role,
          impactPoints: 0,
          totalPoints: 0,
          earnedBadges: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success(`Account created as ${role.toUpperCase()}!`);
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
        // Check if role matches (optional but good for UX)
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        if (userDoc.exists() && userDoc.data().role !== role) {
          toast.warning(`You are logged in, but your account is registered as a ${userDoc.data().role}.`);
        }
        toast.success("Logged in successfully!");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (!role) {
      toast.error("Please select if you are an NGO or a Volunteer first.");
      return;
    }

    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Check if user exists
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: role,
          impactPoints: 0,
          totalPoints: 0,
          earnedBadges: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success(`Registered as ${role.toUpperCase()}!`);
      } else {
        toast.success("Logged in with Google!");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Google login failed.");
    } finally {
      setLoading(false);
    }
  };

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-2 md:p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full md:max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6"
        >
          <Card 
            className="cursor-pointer hover:border-primary transition-all hover:shadow-lg group shadow-sm border-slate-200"
            onClick={() => setRole('ngo')}
          >
            <CardHeader className="text-center p-8">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Building2 className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Login as NGO</CardTitle>
              <CardDescription>Post opportunities and manage volunteers</CardDescription>
            </CardHeader>
          </Card>

          <Card 
            className="cursor-pointer hover:border-primary transition-all hover:shadow-lg group shadow-sm border-slate-200"
            onClick={() => setRole('volunteer')}
          >
            <CardHeader className="text-center p-8">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Heart className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Login as Volunteer</CardTitle>
              <CardDescription>Find causes and contribute your skills</CardDescription>
            </CardHeader>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-0 md:p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full md:max-w-md h-screen md:h-auto flex flex-col justify-center"
      >
        <div className="p-4 md:p-0 w-full">
          <Button 
            variant="ghost" 
            className="mb-4" 
            onClick={() => setRole(null)}
          >
            ← Back to selection
          </Button>

          <Card className="shadow-xl border-t-4 border-t-primary h-fit md:h-auto">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-center mb-2">
              {role === 'ngo' ? <Building2 className="w-6 h-6 mr-2 text-primary" /> : <Heart className="w-6 h-6 mr-2 text-primary" />}
              <span className="font-semibold text-primary uppercase tracking-wider text-sm">
                {role} Portal
              </span>
            </div>
            <CardTitle className="text-2xl text-center">Welcome Back</CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="m@example.com" 
                      className="pl-10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="password" 
                      type="password" 
                      className="pl-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <TabsContent value="login">
                  <Button 
                    className="w-full" 
                    onClick={() => handleEmailAuth('login')}
                    disabled={loading}
                  >
                    {loading ? "Logging in..." : "Login"}
                    <LogIn className="ml-2 h-4 w-4" />
                  </Button>
                </TabsContent>
                
                <TabsContent value="signup">
                  <Button 
                    className="w-full" 
                    onClick={() => handleEmailAuth('signup')}
                    disabled={loading}
                  >
                    {loading ? "Creating account..." : "Create Account"}
                    <UserPlus className="ml-2 h-4 w-4" />
                  </Button>
                </TabsContent>
              </div>
            </Tabs>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <Button 
              variant="outline" 
              className="w-full" 
              onClick={handleGoogleAuth}
              disabled={loading}
            >
              <Chrome className="mr-2 h-4 w-4" />
              Google
            </Button>
          </CardContent>
          <CardFooter>
            <p className="text-xs text-center w-full text-muted-foreground">
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>
          </CardFooter>
        </Card>
        </div>
      </motion.div>
    </div>
  );
}
