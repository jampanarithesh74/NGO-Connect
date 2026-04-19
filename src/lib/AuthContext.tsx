import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';

interface AuthContextType {
  user: User | null;
  userRole: 'ngo' | 'volunteer' | null;
  userSkills: string[] | null;
  loading: boolean;
  isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userRole: null,
  userSkills: null,
  loading: true,
  isAuthReady: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<'ngo' | 'volunteer' | null>(null);
  const [userSkills, setUserSkills] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Use onSnapshot to reactively get the user profile
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const unsubscribeProfile = onSnapshot(userDocRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            setUserRole(data.role);
            setUserSkills(data.skills || []);
          } else {
            setUserRole(null);
            setUserSkills(null);
          }
          setLoading(false);
          setIsAuthReady(true);
        }, (error) => {
          console.error("Error fetching user profile:", error);
          setUserRole(null);
          setUserSkills(null);
          setLoading(false);
          setIsAuthReady(true);
        });

        return () => unsubscribeProfile();
      } else {
        setUserRole(null);
        setUserSkills(null);
        setLoading(false);
        setIsAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, userRole, userSkills, loading, isAuthReady }}>
      {children}
    </AuthContext.Provider>
  );
};
