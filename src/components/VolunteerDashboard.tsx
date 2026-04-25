import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/src/lib/AuthContext';
import { auth, db } from '@/src/lib/firebase';
import { signOut } from 'firebase/auth';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  getDoc,
  addDoc,
  updateDoc, 
  serverTimestamp,
  Timestamp,
  where,
  limit
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/src/lib/firestoreUtils';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  LayoutDashboard, 
  Search, 
  Zap, 
  BookmarkCheck, 
  Clock, 
  Trophy, 
  LogOut, 
  Heart,
  MapPin,
  Calendar,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  Stethoscope,
  Utensils,
  BookOpen,
  Truck,
  Wrench,
  Users,
  Play,
  Medal,
  Award,
  TrendingUp,
  Star,
  User,
  Plus,
  X,
  Navigation,
  Upload,
  Loader2,
  Crown,
  Target,
  Shield,
  MessageCircle,
  Send,
  Check,
  AlertCircle,
  Camera
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { awardPointsAndBadges } from '@/src/lib/gamification';
import MapComponent from './MapComponent';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Section = 'home' | 'find' | 'matched' | 'accepted' | 'progress' | 'contributions' | 'leaderboard' | 'badges' | 'map' | 'profile' | 'squad';

interface Task {
  id: string;
  reportId: string;
  ngoId: string;
  ngoName?: string;
  volunteerId?: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  urgency: 'Immediate' | 'Soon' | 'Planned';
  category?: 'Vital' | 'Essential' | 'Stabilizing';
  taskType?: 'Health' | 'Food' | 'Logistics' | 'Education' | 'Rescue' | 'Shelter' | 'Environment' | 'Others';
  deadline?: Timestamp;
  complexity: 'Simple' | 'Standard' | 'Complex';
  beneficiaries: number;
  status: 'pending' | 'accepted' | 'active' | 'pending_approval' | 'completed' | 'cancelled';
  aiDetails: {
    recommendedTeamSize: number;
    minMembers: number;
    checklist: string[];
  };
  currentRadius: number;
  timerExpiresAt?: Timestamp;
  squadId?: string;
  handledByNGO?: boolean;
  createdAt: Timestamp;
  proofImageUrl?: string;
  completionNotes?: string;
  rejectionReason?: string;
  location?: {
    lat: number;
    lng: number;
    area: string;
    landmark?: string;
    district: string;
    state: string;
  };
}

interface Squad {
  id: string;
  taskId: string;
  leadId: string;
  leadName: string;
  memberIds: string[];
  status: 'recruiting' | 'executing' | 'completed';
  maxMembers: number;
  createdAt: Timestamp;
}

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: Timestamp;
}

interface VolunteerProfile {
  uid: string;
  displayName?: string;
  email: string;
  impactPoints?: number;
  totalPoints?: number;
  earnedBadges?: { id: string; label: string; earnedAt: string }[];
  skills?: string[];
}

const BADGE_CONFIG = [
  { id: 'first_responder', label: 'First Responder', description: 'Completed your first task!', icon: Sparkles, color: 'text-amber-500', bg: 'bg-amber-50' },
  { id: 'high_impact', label: 'High Impact', description: 'Completed 3 High Priority tasks.', icon: Zap, color: 'text-blue-500', bg: 'bg-blue-50' },
  { id: 'community_pillar', label: 'Community Pillar', description: 'Completed 10 total tasks.', icon: Trophy, color: 'text-purple-500', bg: 'bg-purple-50' },
];

const PREDEFINED_SKILLS = [
  { id: 'medical', label: 'Medical Support', icon: Stethoscope },
  { id: 'food', label: 'Food Supply', icon: Utensils },
  { id: 'education', label: 'Education/Teaching', icon: BookOpen },
  { id: 'logistics', label: 'Logistics/Transport', icon: Truck },
  { id: 'technical', label: 'Technical/Repair', icon: Wrench },
  { id: 'social', label: 'Social Work', icon: Users },
];

export default function VolunteerDashboard() {
  const { user, userSkills } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>('home');
  const [pendingTasksState, setPendingTasksState] = useState<Task[]>([]);
  const [personalTasksState, setPersonalTasksState] = useState<Task[]>([]);
  const [squadTasksState, setSquadTasksState] = useState<Task[]>([]);
  const [matchedTasks, setMatchedTasks] = useState<Task[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [customSkill, setCustomSkill] = useState('');
  const [isSavingSkills, setIsSavingSkills] = useState(false);
  const [topVolunteers, setTopVolunteers] = useState<VolunteerProfile[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<VolunteerProfile | null>(null);
  const [activeSquad, setActiveSquad] = useState<Squad | null>(null);
  const [squadMessages, setSquadMessages] = useState<Message[]>([]);
  const [squadMembers, setSquadMembers] = useState<VolunteerProfile[]>([]);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [incomingNotifications, setIncomingNotifications] = useState<any[]>([]);
  const [activeNotification, setActiveNotification] = useState<any | null>(null);
  const [isJoiningSquad, setIsJoiningSquad] = useState(false);
  const [isTakingResponsibility, setIsTakingResponsibility] = useState(false);
  const [isStartMissionDialogOpen, setIsStartMissionDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('all');
  
  // Solo Checklist State
  const [isChecklistDialogOpen, setIsChecklistDialogOpen] = useState(false);
  const [checklistTask, setChecklistTask] = useState<Task | null>(null);
  const [confirmedItems, setConfirmedItems] = useState<string[]>([]);

  const handleUpdateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      toast.success(`Status updated to ${newStatus}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  // Photo Verification State
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [submittingTask, setSubmittingTask] = useState<Task | null>(null);
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  useEffect(() => {
    // Robust camera attachment that ensures video element is ready
    if (isWebcamActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isWebcamActive]);

  const startWebcam = async () => {
    setIsCameraLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      streamRef.current = stream;
      setIsWebcamActive(true);
      // Logic handled by useEffect now
    } catch (err) {
      console.error("Error accessing webcam:", err);
      toast.error("Camera access denied or not available. Please check browser permissions.");
    } finally {
      setIsCameraLoading(false);
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsWebcamActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setProofImage(dataUrl);
        stopWebcam();
      }
    }
  };

  useEffect(() => {
    if (!isSubmitDialogOpen) {
      stopWebcam();
    }
  }, [isSubmitDialogOpen]);

  // Fetch top volunteers for leaderboard
  useEffect(() => {
    const q = query(
      collection(db, 'users'), 
      where('role', '==', 'volunteer'),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const volunteers = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as VolunteerProfile[];
      
      // Sort in memory to avoid composite index requirements during development
      const sorted = volunteers
        .sort((a, b) => 
          Math.max(b.impactPoints || 0, b.totalPoints || 0) - 
          Math.max(a.impactPoints || 0, a.totalPoints || 0)
        )
        .slice(0, 10);
        
      setTopVolunteers(sorted);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, []);

  // Fetch current user profile for points and badges
  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as VolunteerProfile;
        setCurrentUserProfile({ uid: doc.id, ...data });
        if (data.skills) {
          setSelectedSkills(data.skills);
        }
      }
    });
    return () => unsubscribe();
  }, [user?.uid]);

  // Fetch active squad if user is part of one
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'squads'),
      where('memberIds', 'array-contains', user.uid),
      where('status', 'in', ['recruiting', 'executing']),
      limit(1)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const squadData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Squad;
        setActiveSquad(squadData);
      } else {
        setActiveSquad(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'squads');
    });
    return () => unsubscribe();
  }, [user?.uid]);

  // Fetch messages and members for active squad
  useEffect(() => {
    if (!activeSquad) {
      setSquadMessages([]);
      setSquadMembers([]);
      return;
    }

    const messagesQuery = query(
      collection(db, `squads/${activeSquad.id}/messages`),
      orderBy('createdAt', 'asc')
    );
    const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Message[];
      setSquadMessages(messages);
    });

    const membersQuery = query(
      collection(db, 'users'),
      where('uid', 'in', activeSquad.memberIds)
    );
    const unsubscribeMembers = onSnapshot(membersQuery, (snapshot) => {
      const members = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as VolunteerProfile[];
      setSquadMembers(members);
    });

    return () => {
      unsubscribeMessages();
      unsubscribeMembers();
    };
  }, [activeSquad?.id, activeSquad?.memberIds]);

  // Combined tasks for UI filtering
  const allTasks = useMemo(() => {
    const taskMap = new Map<string, Task>();
    pendingTasksState.forEach(t => taskMap.set(t.id, t));
    personalTasksState.forEach(t => taskMap.set(t.id, t));
    squadTasksState.forEach(t => taskMap.set(t.id, t));
    
    let tasks = Array.from(taskMap.values());

    // Apply manual filter if selected
    if (selectedType !== 'all') {
      tasks = tasks.filter(t => {
        const type = t.taskType || 'Others';
        return type.toLowerCase() === selectedType.toLowerCase();
      });
    }

    return tasks.sort((a, b) => {
      // 1. Extreme Urgency (Closest Deadline First)
      const aDeadline = a.deadline?.toMillis() || Infinity;
      const bDeadline = b.deadline?.toMillis() || Infinity;
      
      // If one has a deadline and the other doesn't, prioritized the one with deadline
      if (aDeadline !== bDeadline) {
        // If the difference is significant (e.g. 1 hour), prioritize by deadline
        if (Math.abs(aDeadline - bDeadline) > 1000 * 60) {
          return aDeadline - bDeadline;
        }
      }
      
      // 2. Impact Category
      const categoryOrder: Record<string, number> = { 'Vital': 0, 'Essential': 1, 'Stabilizing': 2 };
      const aCat = categoryOrder[a.category || 'Essential'] ?? 1;
      const bCat = categoryOrder[b.category || 'Essential'] ?? 1;
      if (aCat !== bCat) return aCat - bCat;

      // 3. Status Order (Priority string)
      const priorityOrder: Record<string, number> = { 'High': 0, 'Medium': 1, 'Low': 2 };
      const aPrio = priorityOrder[a.priority] ?? 1;
      const bPrio = priorityOrder[b.priority] ?? 1;
      if (aPrio !== bPrio) return aPrio - bPrio;

      // 4. Default to Recency
      return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
    });
  }, [pendingTasksState, personalTasksState, squadTasksState, selectedType]);

  // Fetch tasks and expansion logic
  useEffect(() => {
    if (!user?.uid) return;

    // 1. Fetch pending tasks (available for everyone to see)
    const qPending = query(
      collection(db, 'tasks'), 
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribePending = onSnapshot(qPending, (snapshot) => {
      const newTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Task[];
      setPendingTasksState(newTasks);

      // Expansion Logic for pending tasks
      const now = Date.now();
      newTasks.forEach(async (task) => {
        if (task.status === 'pending' && task.timerExpiresAt) {
          const expiresAt = task.timerExpiresAt.toMillis();
          if (now > expiresAt && task.currentRadius < 30) {
            const nextRadius = (task.currentRadius || 10) + 10;
            console.log(`Expanding radius for task ${task.id} to ${nextRadius}km`);
            try {
              await updateDoc(doc(db, 'tasks', task.id), {
                currentRadius: nextRadius,
                timerExpiresAt: Timestamp.fromMillis(now + 30 * 60 * 1000),
                updatedAt: serverTimestamp()
              });
              toast.info(`Task radius expanded for nearby volunteers!`, {
                description: task.title
              });
            } catch (e) {
              console.error("Failed to expand radius:", e);
            }
          }
        }
      });
    }, (error) => {
      console.warn("Pending tasks fetch restricted:", error.message);
    });

    // 2. Fetch my personal tasks (assigned to me)
    const qPersonal = query(
      collection(db, 'tasks'),
      where('volunteerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribePersonal = onSnapshot(qPersonal, (snapshot) => {
      const newTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Task[];
      setPersonalTasksState(newTasks);
    }, (error) => {
      console.warn("Personal tasks fetch restricted:", error.message);
    });

    return () => {
      unsubscribePending();
      unsubscribePersonal();
    };
  }, [user?.uid]);

  // Separate effect for squad tasks as it depends on activeSquad state
  useEffect(() => {
    if (!user?.uid || !activeSquad?.id) {
      setSquadTasksState([]);
      return;
    }

    const qSquad = query(
      collection(db, 'tasks'),
      where('squadId', '==', activeSquad.id)
    );

    const unsubscribeSquad = onSnapshot(qSquad, (snapshot) => {
      const newTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Task[];
      setSquadTasksState(newTasks);
    }, (error) => {
      console.warn("Squad tasks fetch restricted:", error.message);
    });

    return () => unsubscribeSquad();
  }, [user?.uid, activeSquad?.id]);

  // Location tracking and Notification Listener
  useEffect(() => {
    if (!user?.uid) return;

    // 1. Get initial location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation({ 
            lat: position.coords.latitude, 
            lng: position.coords.longitude 
          });
        },
        (error) => console.warn("Location access denied", error)
      );
    }

    // 2. Listen for nearby recruitment notifications
    const qNotifications = query(
      collection(db, 'notifications'),
      where('type', '==', 'squad_recruitment'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribeNotifications = onSnapshot(qNotifications, (snapshot) => {
      const allNotifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setIncomingNotifications(allNotifs);
    });

    return () => unsubscribeNotifications();
  }, [user?.uid]);

  // Distance helper (Haversine)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Filter nearby notifications
  useEffect(() => {
    if (!currentLocation || incomingNotifications.length === 0 || activeSquad) return;

    const nearby = incomingNotifications.find(notif => {
      if (!notif.location?.lat || !notif.location?.lng) return false;
      const distance = calculateDistance(
        currentLocation.lat, 
        currentLocation.lng, 
        notif.location.lat, 
        notif.location.lng
      );
      // Ensure user isn't already the lead/member (though rule handles this, UI should too)
      const isAlreadyLead = notif.leadId === user?.uid;
      return distance <= 10 && !isAlreadyLead;
    });

    if (nearby && (!activeNotification || activeNotification.id !== nearby.id)) {
      setActiveNotification(nearby);
    }
  }, [currentLocation, incomingNotifications, activeSquad]);

  const handleUpdateSkills = async () => {
    if (!user?.uid) return;
    setIsSavingSkills(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        skills: selectedSkills,
        updatedAt: serverTimestamp()
      });
      toast.success("Profile updated successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      toast.error("Failed to update profile");
    } finally {
      setIsSavingSkills(false);
    }
  };

  const handleAddCustomSkill = () => {
    if (!customSkill.trim()) return;
    if (selectedSkills.includes(customSkill.trim())) {
      toast.error("Skill already added");
      return;
    }
    setSelectedSkills([...selectedSkills, customSkill.trim()]);
    setCustomSkill('');
  };

  const handleRemoveSkill = (skill: string) => {
    setSelectedSkills(selectedSkills.filter(s => s !== skill));
  };

  const handleNavigate = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  };

  const handleJoinSquad = async (squadId: string) => {
    if (activeSquad) {
      toast.error("You are already part of a squad!");
      return;
    }
    try {
      const squadRef = doc(db, 'squads', squadId);
      const squadSnap = await getDoc(squadRef);
      if (!squadSnap.exists()) return;
      const squad = squadSnap.data() as Squad;
      
      if (squad.memberIds.length >= squad.maxMembers) {
        toast.error("Squad is full!");
        return;
      }

      await updateDoc(squadRef, {
        memberIds: [...squad.memberIds, user!.uid],
        updatedAt: serverTimestamp()
      });

      // Sync memberIds to task for better security rules performance
      const taskRef = doc(db, 'tasks', squad.taskId);
      const taskSnap = await getDoc(taskRef);
      if (taskSnap.exists()) {
        const currentTaskMembers = taskSnap.data()?.memberIds || [];
        if (!currentTaskMembers.includes(user!.uid)) {
          await updateDoc(taskRef, {
            memberIds: [...currentTaskMembers, user!.uid]
          });
        }
      }

      toast.success("Joined the squad!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `squads/${squadId}`);
    }
  };

  const handleRequestTeam = async (task: Task) => {
    if (activeSquad) {
      toast.error("You are already in a squad. Finish or leave existing projects first.");
      return;
    }

    try {
      const squadRef = await addDoc(collection(db, 'squads'), {
        taskId: task.id,
        leadId: user!.uid,
        leadName: user?.displayName || user?.email?.split('@')[0],
        memberIds: [user!.uid],
        status: 'recruiting',
        maxMembers: (task.aiDetails?.recommendedTeamSize || 2) + 2, // Allow some buffer
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'tasks', task.id), {
        squadId: squadRef.id,
        status: 'accepted',
        memberIds: [user!.uid], // Lead is the first member
        updatedAt: serverTimestamp()
      });

      // Notify nearby volunteers (Simplified: create system notification)
      await addDoc(collection(db, 'notifications'), {
        type: 'squad_recruitment',
        taskId: task.id,
        squadId: squadRef.id,
        title: "Squad Recruiting!",
        message: `New squad forming for: ${task.title}. Join now!`,
        location: task.location,
        radius: 10,
        createdAt: serverTimestamp()
      });

      toast.success("Squad created! You are the Team Lead.");
      setActiveSection('squad');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'squads');
    }
  };

  const [isGeneratingChecklist, setIsGeneratingChecklist] = useState(false);

  const handleAcceptSolo = async (task: Task) => {
    setChecklistTask(task);
    setConfirmedItems([]);
    
    // If checklist is missing, generate it on the fly
    if (!task.aiDetails?.checklist || task.aiDetails.checklist.length === 0) {
      setIsGeneratingChecklist(true);
      setIsChecklistDialogOpen(true); // Open early to show loading state
      try {
        const prompt = `
          Analyze this volunteer task:
          Title: ${task.title}
          Description: ${task.description}
          Complexity: ${task.complexity}
          
          Generate a realistic checklist of 5-7 items (tools, safety gear, or specific skills) 
          a volunteer needs to CONFIRM they have or can do before starting this task SOLO.
          
          Return ONLY a JSON array of strings.
        `;

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        });

        const checklist = JSON.parse(response.text || "[]");
        
        // Update task with generated checklist for future use
        const updatedAiDetails = {
          ...task.aiDetails,
          checklist: checklist
        };
        
        await updateDoc(doc(db, 'tasks', task.id), {
          aiDetails: updatedAiDetails
        });
        
        setChecklistTask({
          ...task,
          aiDetails: updatedAiDetails
        });
      } catch (err) {
        console.error("AI Checklist generation error:", err);
        toast.error("Failed to generate mission requirements. Using defaults.");
        // Fallback checklist
        const fallback = ["Basic First Aid Awareness", "Phone with battery", "Appropriate Footwear"];
        setChecklistTask({
          ...task,
          aiDetails: { ...task.aiDetails, checklist: fallback }
        });
      } finally {
        setIsGeneratingChecklist(false);
      }
    } else {
      setIsChecklistDialogOpen(true);
    }
  };

  const confirmSoloStart = async () => {
    if (!checklistTask || !checklistTask.aiDetails) return;
    if (confirmedItems.length < (checklistTask.aiDetails.checklist?.length || 0)) {
      toast.error("Please confirm all checklist items first.");
      return;
    }

    try {
      await updateDoc(doc(db, 'tasks', checklistTask.id), {
        status: 'accepted',
        volunteerId: user!.uid,
        memberIds: [user!.uid], // Solo volunteer is the only member
        updatedAt: serverTimestamp()
      });
      toast.success("Task accepted! You can start it from your Accepted Tasks section.");
      setIsChecklistDialogOpen(false);
      setActiveSection('accepted');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${checklistTask.id}`);
    }
  };

  const handleStartTask = async () => {
    if (!activeSquad || activeSquad.leadId !== user?.uid) return;
    try {
      await updateDoc(doc(db, 'squads', activeSquad.id), {
        status: 'executing',
        updatedAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'tasks', activeSquad.taskId), {
        status: 'active',
        updatedAt: serverTimestamp()
      });
      toast.success("Task execution started!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `squads/${activeSquad.id}`);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!activeSquad || !text.trim()) return;

    // Check if task is completed - if so, chat is read only
    const taskData = allTasks.find(t => t.squadId === activeSquad.id);
    if (taskData?.status === 'completed') {
      toast.error("Mission complete. Coordination channel is now read-only.");
      return;
    }

    try {
      await addDoc(collection(db, `squads/${activeSquad.id}/messages`), {
        senderId: user?.uid,
        senderName: user?.displayName || user?.email?.split('@')[0],
        text: text.trim(),
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `squads/${activeSquad.id}/messages`);
    }
  };

  const handleStartMissionConfirm = async () => {
    if (!activeSquad) return;
    
    setIsSavingSkills(true); // Using this as a general loading state for simplicity
    try {
      // Find the associated task
      const task = allTasks.find(t => t.squadId === activeSquad.id);
      if (!task) throw new Error("Task not found");

      await updateDoc(doc(db, 'squads', activeSquad.id), {
        status: 'executing',
        updatedAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'tasks', task.id), {
        status: 'active',
        updatedAt: serverTimestamp()
      });

      toast.success("Mission started! Coordinates unlocked for the squad.");
      setIsStartMissionDialogOpen(false);
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `squads/${activeSquad.id}`);
    } finally {
      setIsSavingSkills(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image too large. Please select an image under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      // Basic compression: draw to canvas and get smaller dataUrl
      const img = new Image();
      img.src = reader.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setProofImage(dataUrl);
      };
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitVerification = async () => {
    if (!submittingTask || !proofImage) {
      toast.error("Please provide a photo as proof of completion.");
      return;
    }

    setIsUploading(true);
    try {
      await updateDoc(doc(db, 'tasks', submittingTask.id), {
        status: 'pending_approval',
        proofImageUrl: proofImage,
        completionNotes: completionNotes,
        updatedAt: serverTimestamp()
      });
      
      toast.success("Task submitted for verification! Point awarding is pending NGO approval.");
      setIsSubmitDialogOpen(false);
      setSubmittingTask(null);
      setProofImage(null);
      setCompletionNotes('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${submittingTask.id}`);
      toast.error("Failed to submit verification.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveSkills = async () => {
    if (selectedSkills.length === 0 && !customSkill.trim()) {
      toast.error("Please select or enter at least one skill.");
      return;
    }

    setIsSavingSkills(true);
    try {
      const finalSkills = [...selectedSkills];
      if (customSkill.trim()) finalSkills.push(customSkill.trim());

      await updateDoc(doc(db, 'users', user!.uid), {
        skills: finalSkills,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user?.uid}`);
    } finally {
      setIsSavingSkills(false);
    }
  };

  const handleMatchTasks = async () => {
    if (!userSkills || userSkills.length === 0) {
      toast.error("Please set your skills first.");
      return;
    }

    setIsMatching(true);
    setActiveSection('matched');
    
    try {
      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `
          Match the following volunteer skills with the list of available tasks.
          Volunteer Skills: ${userSkills.join(', ')}
          
          Available Tasks:
          ${allTasks.map(t => `- [ID: ${t.id}] ${t.title}: ${t.description}`).join('\n')}
          
          Return a JSON array of task IDs that are a good match for the volunteer's skills.
          Only return the array of IDs.
        `,
      });
      
      const response = await model;
      const text = response.text || "";
      const jsonMatch = text.match(/\[.*\]/s);
      
      if (jsonMatch) {
        const matchedIds = JSON.parse(jsonMatch[0]);
        // Use allTasks which is already properly sorted and doesn't break React hook rules
        const matched = allTasks.filter(t => matchedIds.includes(t.id));
        setMatchedTasks(matched);
        toast.success(`Found ${matched.length} matched tasks!`);
      }
    } catch (error) {
      console.error("Matching error:", error);
      toast.error("Failed to match tasks. Showing all tasks instead.");
      setMatchedTasks(allTasks);
    } finally {
      setIsMatching(false);
    }
  };

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev => 
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    );
  };

  // If volunteer hasn't set skills yet, show skill selection
  if (userSkills && userSkills.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl w-full"
        >
          <Card className="shadow-xl border-t-4 border-t-primary">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-3xl">What are your skills?</CardTitle>
              <CardDescription>
                Tell us what you're good at so we can match you with the right NGO needs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {PREDEFINED_SKILLS.map((skill) => (
                  <button
                    key={skill.id}
                    onClick={() => toggleSkill(skill.label)}
                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 text-center ${
                      selectedSkills.includes(skill.label)
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-slate-100 hover:border-slate-200 text-slate-600'
                    }`}
                  >
                    <skill.icon className="w-6 h-6" />
                    <span className="text-sm font-medium">{skill.label}</span>
                  </button>
                ))}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="custom-skill">Other Skills</Label>
                <Input 
                  id="custom-skill" 
                  placeholder="e.g., Graphic Design, Counseling, etc." 
                  value={customSkill}
                  onChange={(e) => setCustomSkill(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button 
                className="w-full py-6 text-lg" 
                onClick={handleSaveSkills}
                disabled={isSavingSkills}
              >
                {isSavingSkills ? "Saving..." : "Start Volunteering"}
              </Button>
              <Button 
                variant="ghost" 
                className="w-full text-slate-500"
                onClick={() => {
                  localStorage.removeItem('onboarding_role');
                  signOut(auth);
                }}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Back to Login
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    );
  }

  const sidebarItems = [
    { id: 'home', label: 'Overview', icon: LayoutDashboard },
    { id: 'find', label: 'Find Needs', icon: Search },
    { id: 'matched', label: 'Matched Tasks', icon: Zap },
    { id: 'map', label: 'Map View', icon: MapPin },
    { id: 'accepted', label: 'Accepted Tasks', icon: BookmarkCheck },
    { id: 'progress', label: 'In Progress Tasks', icon: Clock },
    { id: 'squad', label: 'Squad Room', icon: MessageCircle, hidden: !activeSquad },
    { id: 'contributions', label: 'Your Contributions', icon: Trophy },
    { id: 'leaderboard', label: 'Leaderboard', icon: Medal },
    { id: 'badges', label: 'My Badges', icon: Award },
    { id: 'profile', label: 'My Profile', icon: User },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col shadow-sm">
        <div className="p-6">
          <div className="flex items-center gap-2 text-primary mb-8">
            <Heart className="w-8 h-8 fill-primary" />
            <span className="font-bold text-xl tracking-tight">Volunteer</span>
          </div>
          
          <nav className="space-y-1">
            {sidebarItems.filter(i => !i.hidden).map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id as Section)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  activeSection === item.id 
                    ? 'bg-primary text-primary-foreground shadow-md' 
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        
        <div className="mt-auto p-6 border-t">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
              {user?.email?.[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.email}</p>
              <p className="text-xs text-slate-500">Volunteer</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => signOut(auth)}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <AnimatePresence mode="wait">
          {activeSection === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-5xl mx-auto space-y-8"
            >
              {activeSquad && (
                <Card className="bg-gradient-to-br from-indigo-600 to-blue-700 border-none shadow-xl text-white overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Users className="w-32 h-32" />
                  </div>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle className="text-2xl font-bold">Active Squad Mission</CardTitle>
                        <CardDescription className="text-indigo-100 italic">"Coming together is a beginning; keeping together is progress; working together is success."</CardDescription>
                      </div>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="bg-white/20 hover:bg-white/30 border-none text-white font-bold"
                        onClick={() => setActiveSection('squad')}
                      >
                        Enter Squad Room
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
                        <Users className="w-6 h-6 outline-none" />
                      </div>
                      <div>
                        <div className="text-sm font-medium opacity-80 uppercase tracking-wider">Squad Strength</div>
                        <div className="text-xl font-bold">{activeSquad.memberIds.length} Members Joined</div>
                      </div>
                      <div className="ml-auto flex -space-x-4">
                        {squadMembers.slice(0, 5).map(m => (
                          <div key={m.uid} className="w-10 h-10 rounded-full border-4 border-indigo-600 bg-indigo-400 flex items-center justify-center font-bold text-xs shadow-md transition-transform hover:scale-110 hover:z-10" title={m.displayName || m.email}>
                            {m.email?.[0].toUpperCase()}
                          </div>
                        ))}
                        {activeSquad.memberIds.length > 5 && (
                          <div className="w-10 h-10 rounded-full border-4 border-indigo-600 bg-white/20 backdrop-blur flex items-center justify-center font-bold text-xs shadow-md">
                            +{activeSquad.memberIds.length - 5}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="text-left">
                <h2 className="text-4xl font-bold text-slate-900 mb-2">Welcome back!</h2>
                <p className="text-slate-500 text-lg">You're making a real difference in the community.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <Card className="bg-primary text-primary-foreground shadow-xl border-none overflow-hidden relative group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                    <Star className="w-24 h-24" />
                  </div>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium opacity-80 uppercase tracking-wider">Total Impact Points</CardTitle>
                    <div className="text-5xl font-bold mt-2">
                      {Math.max(currentUserProfile?.impactPoints || 0, currentUserProfile?.totalPoints || 0)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs opacity-70">Keep completing tasks to climb the leaderboard!</p>
                  </CardContent>
                </Card>

                <Card className="bg-white shadow-md hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Current Rank</CardTitle>
                    <div className="text-4xl font-bold text-slate-900 mt-2 flex items-baseline gap-2">
                      #{topVolunteers.findIndex(v => v.uid === user?.uid) + 1 || 'N/A'}
                      <span className="text-sm font-normal text-slate-400">Global</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                      <TrendingUp className="w-4 h-4" />
                      <span>Top {Math.max(1, Math.round(((topVolunteers.findIndex(v => v.uid === user?.uid) + 1) / (topVolunteers.length || 1)) * 100))}% of volunteers</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white shadow-md hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Badges Earned</CardTitle>
                    <div className="text-4xl font-bold text-slate-900 mt-2">
                      {currentUserProfile?.earnedBadges?.length || 0}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex -space-x-2 overflow-hidden">
                      {currentUserProfile?.earnedBadges?.slice(0, 3).map((badge, i) => {
                        const config = BADGE_CONFIG.find(b => b.id === badge.id);
                        const Icon = config?.icon || Award;
                        return (
                          <div key={i} className={`w-8 h-8 rounded-full border-2 border-white ${config?.bg || 'bg-slate-100'} flex items-center justify-center shadow-sm`}>
                            <Icon className={`w-4 h-4 ${config?.color || 'text-slate-500'}`} />
                          </div>
                        );
                      })}
                      {(currentUserProfile?.earnedBadges?.length || 0) > 3 && (
                        <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                          +{(currentUserProfile?.earnedBadges?.length || 0) - 3}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-white/50 backdrop-blur hover:bg-white transition-colors cursor-pointer group text-left" onClick={() => setActiveSection('find')}>
                  <CardHeader>
                    <Search className="w-8 h-8 text-primary mb-2 group-hover:scale-110 transition-transform" />
                    <CardTitle className="text-lg">Find Needs</CardTitle>
                    <CardDescription>Browse all available tasks from NGOs</CardDescription>
                  </CardHeader>
                </Card>
                <Card className="bg-white/50 backdrop-blur hover:bg-white transition-colors cursor-pointer group text-left" onClick={() => setActiveSection('matched')}>
                  <CardHeader>
                    <Zap className="w-8 h-8 text-amber-500 mb-2 group-hover:scale-110 transition-transform" />
                    <CardTitle className="text-lg">AI Matching</CardTitle>
                    <CardDescription>Get tasks based on your skills</CardDescription>
                  </CardHeader>
                </Card>
                <Card className="bg-white/50 backdrop-blur hover:bg-white transition-colors cursor-pointer group text-left" onClick={() => setActiveSection('map')}>
                  <CardHeader>
                    <MapPin className="w-8 h-8 text-green-500 mb-2 group-hover:scale-110 transition-transform" />
                    <CardTitle className="text-lg">Map View</CardTitle>
                    <CardDescription>See nearby tasks on a map</CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </motion.div>
          )}

          {activeSection === 'map' && (
            <motion.div
              key="map"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="h-[calc(100vh-250px)] min-h-[500px] flex flex-col"
            >
              <div className="mb-6 flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                    <MapPin className="w-8 h-8 text-primary" />
                    Interactive Task Map
                  </h2>
                  <p className="text-slate-500">Find opportunities near you visually.</p>
                </div>
                <Button variant="outline" onClick={() => setActiveSection('find')}>
                  Back to List
                </Button>
              </div>

              <div className="flex-1 relative min-h-[500px]">
                <MapComponent 
                  center={currentLocation ? [currentLocation.lat, currentLocation.lng] : undefined}
                  markers={allTasks
                    .filter(t => t.status === 'pending' && t.location && typeof t.location.lat === 'number' && typeof t.location.lng === 'number')
                    .map(t => ({
                      id: t.id,
                      position: [t.location!.lat, t.location!.lng],
                      title: t.title,
                      description: `${t.priority} Priority - ${t.urgency}`,
                      onAcceptTask: (id) => {
                        const task = allTasks.find(t => t.id === id);
                        if (task) handleAcceptSolo(task);
                      },
                      onNavigate: (lat, lng) => handleNavigate(lat, lng)
                    }))
                  }
                />
                
                <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur p-3 rounded-lg shadow-lg border border-slate-200 max-w-xs">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Map Legend</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span>Pending Tasks</span>
                    </div>
                    <p className="text-[10px] text-slate-400">Click on a marker to see details and navigate.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'leaderboard' && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                  <Medal className="w-8 h-8 text-amber-500" />
                  Global Leaderboard
                </h2>
                <p className="text-slate-500">Top volunteers making an impact across the world.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card className="bg-white shadow-md border-l-4 border-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Rank</CardTitle>
                    <div className="text-2xl font-bold text-slate-900">
                      #{topVolunteers.findIndex(v => v.uid === user?.uid) + 1 || 'N/A'}
                    </div>
                  </CardHeader>
                </Card>
                <Card className="bg-white shadow-md border-l-4 border-amber-500">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Points</CardTitle>
                    <div className="text-2xl font-bold text-slate-900">
                      {Math.max(currentUserProfile?.impactPoints || 0, currentUserProfile?.totalPoints || 0)}
                    </div>
                  </CardHeader>
                </Card>
                <Card className="bg-white shadow-md border-l-4 border-purple-500">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Badges</CardTitle>
                    <div className="text-2xl font-bold text-slate-900">
                      {currentUserProfile?.earnedBadges?.length || 0}
                    </div>
                  </CardHeader>
                </Card>
              </div>

              <Card className="overflow-hidden border-none shadow-xl">
                <div className="bg-slate-900 text-white p-4 grid grid-cols-12 text-xs font-bold uppercase tracking-widest opacity-70">
                  <div className="col-span-1 text-center">Rank</div>
                  <div className="col-span-7">Volunteer</div>
                  <div className="col-span-2 text-center">Badges</div>
                  <div className="col-span-2 text-right">Points</div>
                </div>
                <div className="divide-y divide-slate-100">
                  {topVolunteers.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                      <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p>No volunteers on the leaderboard yet. Be the first!</p>
                    </div>
                  ) : (
                    topVolunteers.map((v, index) => (
                      <div 
                        key={v.uid} 
                        className={`grid grid-cols-12 p-4 items-center transition-colors ${v.uid === user?.uid ? 'bg-primary/5' : 'bg-white hover:bg-slate-50'}`}
                      >
                        <div className="col-span-1 text-center font-mono text-lg font-bold text-slate-400">
                          {index + 1}
                        </div>
                        <div className="col-span-7 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 border-2 border-white shadow-sm">
                            {v.email?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-2">
                              {v.email?.split('@')[0] || 'Anonymous'}
                              {v.uid === user?.uid && <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">You</span>}
                            </div>
                            <div className="text-xs text-slate-400">{v.earnedBadges?.length || 0} badges earned</div>
                          </div>
                        </div>
                        <div className="col-span-2 flex justify-center -space-x-1">
                          {v.earnedBadges?.slice(0, 3).map((badge, i) => {
                            const config = BADGE_CONFIG.find(b => b.id === badge.id);
                            const Icon = config?.icon || Award;
                            return (
                              <div key={i} className={`w-6 h-6 rounded-full border-2 border-white ${config?.bg || 'bg-slate-100'} flex items-center justify-center shadow-sm`} title={config?.label}>
                                <Icon className={`w-3 h-3 ${config?.color || 'text-slate-500'}`} />
                              </div>
                            );
                          })}
                        </div>
                        <div className="col-span-2 text-right font-mono font-bold text-primary text-xl">
                          {Math.max(v.impactPoints || 0, v.totalPoints || 0)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </motion.div>
          )}

          {activeSection === 'badges' && (
            <motion.div
              key="badges"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-5xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                  <Award className="w-8 h-8 text-primary" />
                  Badge Gallery
                </h2>
                <p className="text-slate-500">Milestones you've achieved through your service.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {BADGE_CONFIG.map((badge) => {
                  const isEarned = currentUserProfile?.earnedBadges?.find(b => b.id === badge.id);
                  const Icon = badge.icon;
                  return (
                    <Card key={badge.id} className={`relative overflow-hidden transition-all duration-500 ${isEarned ? 'border-primary/20 shadow-lg scale-100' : 'opacity-40 grayscale scale-95 bg-slate-50/50'}`}>
                      {isEarned && (
                        <div className="absolute top-0 right-0 p-2">
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        </div>
                      )}
                      <CardHeader className="text-center pb-2">
                        <div className={`mx-auto w-20 h-20 rounded-2xl ${isEarned ? badge.bg : 'bg-slate-200'} flex items-center justify-center mb-4 shadow-inner rotate-3 group-hover:rotate-0 transition-transform`}>
                          <Icon className={`w-10 h-10 ${isEarned ? badge.color : 'text-slate-400'}`} />
                        </div>
                        <CardTitle className="text-xl">{badge.label}</CardTitle>
                        <CardDescription className="text-xs mt-1">{badge.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="text-center pt-0">
                        {isEarned ? (
                          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-4">
                            Earned on {new Date(isEarned.earnedAt).toLocaleDateString()}
                          </div>
                        ) : (
                          <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-4">
                            Locked
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeSection === 'find' && (
            <motion.div
              key="find"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-5xl mx-auto"
            >
              <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 leading-tight">Find Community Needs</h2>
                  <p className="text-slate-500">Pick a mission and start making an impact in your area.</p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-end gap-3">
                  <div className="w-full sm:w-[200px] space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Filter Category</Label>
                    <Select value={selectedType} onValueChange={setSelectedType}>
                      <SelectTrigger className="bg-white border-slate-200">
                        <SelectValue placeholder="All Categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Needs</SelectItem>
                        <SelectItem value="Health">⚕️ Health & Medical</SelectItem>
                        <SelectItem value="Food">🍱 Food Supply</SelectItem>
                        <SelectItem value="Logistics">🚚 Logistics</SelectItem>
                        <SelectItem value="Education">📚 Education</SelectItem>
                        <SelectItem value="Rescue">🛟 Rescue & Relief</SelectItem>
                        <SelectItem value="Shelter">🏠 Shelter/Housing</SelectItem>
                        <SelectItem value="Environment">🌱 Environment</SelectItem>
                        <SelectItem value="Others">🧩 Others</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button 
                    onClick={handleMatchTasks} 
                    disabled={isMatching}
                    className="w-full sm:w-auto bg-gradient-to-r from-primary to-indigo-600 border-none shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all font-bold px-6"
                  >
                    {isMatching ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Matching...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Smart Match
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-16">
                {allTasks.filter(t => t.status === 'pending' && !t.handledByNGO).map((task) => (
                  <Card key={task.id} className="border-l-4" 
                    style={{ 
                      borderLeftColor: task.priority === 'High' ? '#ef4444' : task.priority === 'Medium' ? '#f59e0b' : '#10b981' 
                    }}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start mb-2">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                          task.priority === 'High' ? 'bg-red-100 text-red-700' : 
                          task.priority === 'Medium' ? 'bg-amber-100 text-amber-700' : 
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {task.priority} Priority
                        </span>
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex gap-1">
                            <span className="text-[10px] font-medium text-slate-400 uppercase bg-slate-100 px-2 py-1 rounded">
                              {task.urgency}
                            </span>
                            {task.category && (
                              <span className={`text-[10px] font-bold px-2 py-1 rounded ${
                                task.category === 'Vital' ? 'bg-purple-100 text-purple-700' : 
                                task.category === 'Essential' ? 'bg-blue-100 text-blue-700' : 
                                'bg-slate-100 text-slate-700'
                              }`}>
                                {task.category}
                              </span>
                            )}
                          </div>
                          {task.deadline && (
                            <span className={`text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 ${
                              task.deadline.toMillis() - Date.now() < 1000 * 60 * 60 * 6 
                                ? 'bg-red-50 text-red-600 animate-pulse' 
                                : 'bg-slate-50 text-slate-500'
                            }`}>
                              <Clock className="w-3 h-3" />
                              {task.deadline.toMillis() < Date.now() 
                                ? 'EXPIRED' 
                                : `${Math.floor((task.deadline.toMillis() - Date.now()) / (1000 * 60 * 60))}h left`}
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-primary uppercase bg-primary/5 px-2 py-0.5 rounded mt-1">
                            {10 + (task.priority === 'High' ? 40 : task.priority === 'Medium' ? 20 : 0) + Math.min(60, (task.beneficiaries || 0) * 2) + (task.complexity === 'Complex' ? 50 : task.complexity === 'Standard' ? 20 : 0)} Points
                          </span>
                        </div>
                      </div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {task.title}
                        {task.taskType && (
                          <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded italic">
                            #{task.taskType}
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-slate-600 line-clamp-3 mb-4">
                        {task.description}
                      </p>
                      <div className="flex gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase transition-colors">
                          <Users className="w-3 h-3" />
                          Reach: {task.beneficiaries || 0}
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 text-amber-700 text-[10px] font-bold uppercase transition-colors">
                          <Sparkles className="w-3 h-3" />
                          Effort: {task.complexity || 'Standard'}
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0 flex flex-col gap-3">
                      <div className="flex items-center text-[10px] text-slate-400 gap-2">
                        <Calendar className="w-3 h-3" />
                        {task.createdAt ? task.createdAt.toDate().toLocaleDateString() : "Just now..."}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          className="flex-1 text-xs" 
                          onClick={() => handleAcceptSolo(task)}
                        >
                          Accept Solo
                        </Button>
                        <Button 
                          className="flex-1 text-xs" 
                          onClick={() => handleRequestTeam(task)}
                        >
                          Request Team
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                ))}
              </div>

              {/* Removed sticky bottom button as it's now in the header */}
            </motion.div>
          )}

          {activeSection === 'matched' && (
            <motion.div
              key="matched"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-5xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                  <Zap className="w-8 h-8 text-amber-500 fill-amber-500" />
                  Matched Tasks
                </h2>
                <p className="text-slate-500">AI-powered recommendations based on your unique skills.</p>
              </div>

              {isMatching ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                  <p className="text-slate-500 animate-pulse">Gemini is matching your skills with NGO needs...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {matchedTasks.filter(t => t.status === 'pending').length === 0 ? (
                    <div className="col-span-full py-20 text-center text-slate-400">
                      <p>No direct matches found. Try adding more skills to your profile!</p>
                    </div>
                  ) : (
                    matchedTasks.filter(t => t.status === 'pending').map((task) => (
                      <Card key={task.id} className="border-l-4 border-amber-400 bg-amber-50/30">
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start mb-2">
                            <span className="px-2 py-1 rounded bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider">
                              Best Match
                            </span>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[10px] font-medium text-slate-400 uppercase">
                                {task.urgency}
                              </span>
                              <span className="text-[10px] font-bold text-amber-600 uppercase bg-amber-100/50 px-2 py-0.5 rounded">
                                Impact: {10 + (task.priority === 'High' ? 40 : task.priority === 'Medium' ? 20 : 0) + Math.min(60, (task.beneficiaries || 0) * 2) + (task.complexity === 'Complex' ? 50 : task.complexity === 'Standard' ? 20 : 0)} Pts
                              </span>
                            </div>
                          </div>
                          <CardTitle className="text-lg">{task.title}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-slate-600 mb-4">
                            {task.description}
                          </p>
                          <div className="flex gap-2">
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase transition-colors">
                              <Users className="w-3 h-3" />
                              Reach: {task.beneficiaries || 0}
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-100 text-amber-800 text-[10px] font-bold uppercase transition-colors">
                              <Sparkles className="w-3 h-3" />
                              Effort: {task.complexity || 'Standard'}
                            </div>
                          </div>
                        </CardContent>
                        <CardFooter>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              className="flex-1 text-xs border-amber-300 hover:bg-amber-100" 
                              onClick={() => handleAcceptSolo(task)}
                            >
                              Accept Solo
                            </Button>
                            <Button 
                              className="flex-1 text-xs bg-amber-600 hover:bg-amber-700" 
                              onClick={() => handleRequestTeam(task)}
                            >
                              Request Team
                            </Button>
                          </div>
                        </CardFooter>
                      </Card>
                    ))
                  )}
                </div>
              )}
            </motion.div>
          )}

          {activeSection === 'squad' && activeSquad && (
            <motion.div
              key="squad"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-6xl mx-auto h-[calc(100vh-200px)] flex flex-col"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
                {/* Chat Panel */}
                <Card className="lg:col-span-2 flex flex-col overflow-hidden border-none shadow-2xl bg-white h-full">
                  <CardHeader className="bg-slate-900 text-white p-6 shadow-md z-10">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center rotate-3 group-hover:rotate-0 transition-transform">
                          <MessageCircle className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-xl">Squad Communication</CardTitle>
                          <CardDescription className="text-slate-400 text-xs mt-1">Real-time mission coordination for your team</CardDescription>
                        </div>
                      </div>
                      {activeSquad.leadId === user?.uid && activeSquad.status === 'recruiting' && (
                        <Button 
                          size="default" 
                          className="bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200"
                          onClick={() => setIsStartMissionDialogOpen(true)}
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Start Mission
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
                    {squadMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                        <Shield className="w-16 h-16 opacity-10 animate-pulse" />
                        <div className="text-center">
                          <p className="font-bold text-slate-300 uppercase tracking-widest text-xs mb-1">Silence is Golden</p>
                          <p className="text-sm">Start coordinating with your squad members.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {squadMessages.map((msg, i) => (
                          <div key={msg.id} className={`flex flex-col ${msg.senderId === user?.uid ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm transition-all hover:shadow-md ${
                              msg.senderId === user?.uid 
                                ? 'bg-primary text-primary-foreground rounded-tr-none' 
                                : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
                            }`}>
                              <p className={`font-black text-[10px] mb-1.5 uppercase tracking-wider ${msg.senderId === user?.uid ? 'text-blue-100' : 'text-primary'}`}>
                                {msg.senderId === user?.uid ? 'Tactical Lead (You)' : msg.senderName}
                              </p>
                              <p className="leading-relaxed">{msg.text}</p>
                            </div>
                            <span className="text-[9px] font-bold text-slate-300 mt-1.5 uppercase tracking-tighter">
                              {msg.createdAt ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="p-6 bg-white border-t border-slate-100">
                    {activeSquad.status === 'completed' ? (
                      <div className="w-full text-center py-3 bg-slate-100 text-slate-500 rounded-lg font-bold text-xs flex items-center justify-center gap-2">
                        <Shield className="w-4 h-4" />
                        MISSION COMPLETED - CHAT READ-ONLY
                      </div>
                    ) : (
                      <div className="w-full flex gap-3">
                        <Input 
                          placeholder="Type tactical message..." 
                          className="flex-1 h-12 bg-slate-50 border-none shadow-inner focus-visible:ring-primary"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSendMessage(e.currentTarget.value);
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                        <Button size="icon" className="h-12 w-12 shrink-0 rounded-xl shadow-lg active:scale-95" onClick={(e) => {
                          const target = e.currentTarget.parentElement?.firstChild as HTMLInputElement;
                          handleSendMessage(target.value);
                          target.value = '';
                        }}>
                          <Send className="w-5 h-5" />
                        </Button>
                      </div>
                    )}
                  </CardFooter>
                </Card>

                {/* Squad Members Panel */}
                <div className="space-y-6 h-full flex flex-col overflow-hidden">
                  <Card className="shadow-xl border-none flex-1 overflow-hidden flex flex-col">
                    <CardHeader className="pb-4 bg-slate-50 border-b border-slate-100">
                      <CardTitle className="text-base flex items-center gap-2 font-bold text-slate-800">
                        <Users className="w-4 h-4 text-primary" />
                        Tactical Unit
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 p-4 overflow-y-auto flex-1">
                      {squadMembers.map(member => (
                        <div key={member.uid} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100 group">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white border-2 border-white shadow-md transition-transform group-hover:scale-110 ${
                            member.uid === activeSquad.leadId ? 'bg-amber-500' : 'bg-slate-400'
                          }`}>
                            {member.email?.[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                              {member.displayName || member.email?.split('@')[0]}
                              {member.uid === activeSquad.leadId && <Crown className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                              {member.uid === user?.uid && <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">YOU</span>}
                            </p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-0.5">
                              {member.uid === activeSquad.leadId ? 'Squad Commander' : 'Field Operative'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="shadow-xl border-none bg-primary text-white overflow-hidden shrink-0">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2 font-bold">
                        <Target className="w-4 h-4 text-primary-foreground" />
                        Mission Progress
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 pb-6">
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest opacity-80">
                          <span>Execution Status</span>
                          <span>{activeSquad.status === 'recruiting' ? '25%' : activeSquad.status === 'executing' ? '75%' : '100%'}</span>
                        </div>
                        <div className="w-full h-2.5 bg-white/20 rounded-full overflow-hidden shadow-inner">
                          <div 
                            className={`h-full transition-all duration-1000 bg-white shadow-[0_0_15px_rgba(255,255,255,0.5)] ${
                              activeSquad.status === 'recruiting' ? 'w-1/4' : 
                              activeSquad.status === 'executing' ? 'w-3/4' : 'w-full'
                            }`}
                          ></div>
                        </div>
                      </div>
                      <div className="pt-4 border-t border-white/10">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="w-full bg-white text-primary hover:bg-blue-50 font-black uppercase tracking-widest text-[10px] shadow-lg"
                          onClick={() => setActiveSection('progress')}
                        >
                          View Mission Briefing
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </motion.div>
          )}

          {(activeSection === 'accepted' || activeSection === 'progress' || activeSection === 'contributions') && (
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-5xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900">
                  {activeSection === 'accepted' ? 'Accepted Tasks' : 
                   activeSection === 'progress' ? 'In Progress Tasks' : 'Your Contributions'}
                </h2>
                <p className="text-slate-500">
                  {activeSection === 'accepted' ? 'Tasks you have committed to help with.' : 
                   activeSection === 'progress' ? 'Tasks you are currently working on.' : 
                   'A summary of your positive impact.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allTasks.filter(t => (t.volunteerId === user?.uid || (activeSquad && t.squadId === activeSquad.id)) && (
                  activeSection === 'accepted' ? t.status === 'accepted' : 
                  activeSection === 'progress' ? t.status === 'active' : 
                  (t.status === 'completed' || t.status === 'pending_approval')
                )).length === 0 ? (
                  <div className="col-span-full py-20 text-center text-slate-400">
                    <p>No tasks found in this section.</p>
                  </div>
                ) : (
                  allTasks
                    .filter(t => (t.volunteerId === user?.uid || (activeSquad && t.squadId === activeSquad.id)) && (
                      activeSection === 'accepted' ? t.status === 'accepted' : 
                      activeSection === 'progress' ? t.status === 'active' : 
                      (t.status === 'completed' || t.status === 'pending_approval')
                    ))
                    .map((task) => (
                      <Card key={task.id} className="border-l-4" 
                        style={{ 
                          borderLeftColor: task.priority === 'High' ? '#ef4444' : task.priority === 'Medium' ? '#f59e0b' : '#10b981' 
                        }}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start mb-2">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                              task.priority === 'High' ? 'bg-red-100 text-red-700' : 
                              task.priority === 'Medium' ? 'bg-amber-100 text-amber-700' : 
                              'bg-emerald-100 text-emerald-700'
                            }`}>
                              {task.priority} Priority
                            </span>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[10px] font-medium text-slate-400 uppercase">
                              {task.urgency}
                            </span>
                            <span className="text-[10px] font-bold text-primary uppercase bg-primary/5 px-2 py-0.5 rounded">
                              {10 + (task.priority === 'High' ? 40 : task.priority === 'Medium' ? 20 : 0) + Math.min(60, (task.beneficiaries || 0) * 2) + (task.complexity === 'Complex' ? 50 : task.complexity === 'Standard' ? 20 : 0)} Pts
                            </span>
                          </div>
                        </div>
                        <CardTitle className="text-lg">{task.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-slate-600 mb-4">
                          {task.description}
                        </p>
                        <div className="flex gap-2">
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase">
                            <Users className="w-3 h-3" />
                            Reach: {task.beneficiaries || 0}
                          </div>
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 text-amber-700 text-[10px] font-bold uppercase">
                            <Sparkles className="w-3 h-3" />
                            Effort: {task.complexity || 'Standard'}
                          </div>
                        </div>
                        {task.rejectionReason && task.status === 'active' && (
                            <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg flex gap-2 items-start shrink-0">
                              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                              <div className="space-y-1">
                                <p className="text-[10px] font-bold text-red-700 uppercase">Revision Requested:</p>
                                <p className="text-[11px] text-red-600 line-clamp-3 leading-relaxed">{task.rejectionReason}</p>
                              </div>
                            </div>
                          )}
                        </CardContent>
                        <CardFooter className="flex flex-col gap-2">
                          {task.status === 'accepted' && (
                            <div className="w-full flex gap-2">
                              {task.squadId ? (
                                <div className="flex-1 text-center py-2 bg-amber-50 text-amber-700 font-bold rounded text-xs">
                                  Recruiting Squad...
                                </div>
                              ) : (
                                <Button className="flex-1" onClick={() => handleUpdateTaskStatus(task.id, 'active')}>
                                  <Play className="w-4 h-4 mr-2" />
                                  Start Solo Task
                                </Button>
                              )}
                              {task.location && (
                                <Button variant="outline" onClick={() => handleNavigate(task.location!.lat, task.location!.lng)}>
                                  <Navigation className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          )}
                          {task.status === 'active' && (
                            <div className="w-full flex gap-2">
                              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => {
                                setSubmittingTask(task);
                                setIsSubmitDialogOpen(true);
                              }}>
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Complete Task
                              </Button>
                              {task.location && (
                                <Button variant="outline" onClick={() => handleNavigate(task.location!.lat, task.location!.lng)}>
                                  <Navigation className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          )}
                          {task.status === 'pending_approval' && (
                            <div className="w-full space-y-2">
                              <div className="flex items-center justify-center gap-2 text-amber-600 font-medium bg-amber-50 py-2 rounded">
                                <Clock className="w-4 h-4" />
                                Pending NGO Approval
                              </div>
                              <p className="text-[10px] text-slate-400 text-center italic">
                                Your points will be awarded once the NGO verifies your photo proof.
                              </p>
                            </div>
                          )}
                          {task.status === 'completed' && (
                            <div className="w-full flex items-center justify-center gap-2 text-green-600 font-medium bg-green-50 py-2 rounded">
                              <Trophy className="w-4 h-4" />
                              Task Completed!
                            </div>
                          )}
                        </CardFooter>
                      </Card>
                    ))
                )}
              </div>
            </motion.div>
          )}
          {activeSection === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-3xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                  <User className="w-8 h-8 text-primary" />
                  Your Profile
                </h2>
                <p className="text-slate-500">Manage your skills and personal information.</p>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Account Information</CardTitle>
                    <CardDescription>Basic details about your volunteer account.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400 uppercase">Email Address</Label>
                        <p className="font-medium">{user?.email}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400 uppercase">Account Type</Label>
                        <p className="font-medium">Volunteer</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Your Skills</CardTitle>
                    <CardDescription>Update your skills to get better task recommendations.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <Label>Select from common skills</Label>
                      <div className="flex flex-wrap gap-2">
                        {PREDEFINED_SKILLS.map((skill) => (
                          <button
                            key={skill.id}
                            onClick={() => {
                              if (selectedSkills.includes(skill.label)) {
                                setSelectedSkills(selectedSkills.filter(s => s !== skill.label));
                              } else {
                                setSelectedSkills([...selectedSkills, skill.label]);
                              }
                            }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${
                              selectedSkills.includes(skill.label)
                                ? 'bg-primary border-primary text-primary-foreground shadow-md'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-primary/50'
                            }`}
                          >
                            <skill.icon className="w-4 h-4" />
                            {skill.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <Label>Add custom skills</Label>
                      <div className="flex gap-2">
                        <Input 
                          placeholder="e.g., Graphic Design, Translation..." 
                          value={customSkill}
                          onChange={(e) => setCustomSkill(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddCustomSkill()}
                        />
                        <Button onClick={handleAddCustomSkill} variant="secondary">
                          <Plus className="w-4 h-4 mr-2" />
                          Add
                        </Button>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedSkills.filter(s => !PREDEFINED_SKILLS.some(ps => ps.label === s)).map((skill) => (
                          <div key={skill} className="flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-sm">
                            {skill}
                            <button onClick={() => handleRemoveSkill(skill)} className="hover:text-red-500">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="bg-slate-50/50 border-t p-6">
                    <Button 
                      className="w-full" 
                      onClick={handleUpdateSkills}
                      disabled={isSavingSkills}
                    >
                      {isSavingSkills ? "Saving Changes..." : "Save Profile Changes"}
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Solo Checklist Dialog */}
      <Dialog open={isChecklistDialogOpen} onOpenChange={setIsChecklistDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
              Solo Ready Checklist
            </DialogTitle>
            <DialogDescription>
              Confirm you can handle these requirements before starting solo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {isGeneratingChecklist ? (
              <div className="space-y-4 py-8 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm animate-pulse">AI analyzing task requirements...</p>
              </div>
            ) : (
              checklistTask?.aiDetails?.checklist?.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-lg cursor-pointer hover:bg-white hover:border-primary transition-all group"
                     onClick={() => {
                       if (confirmedItems.includes(item)) {
                         setConfirmedItems(confirmedItems.filter(i => i !== item));
                       } else {
                         setConfirmedItems([...confirmedItems, item]);
                       }
                     }}>
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${confirmedItems.includes(item) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 group-hover:border-primary'}`}>
                    {confirmedItems.includes(item) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm text-slate-700">{item}</span>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button 
              className="w-full h-12 text-base font-bold" 
              onClick={confirmSoloStart}
              disabled={isGeneratingChecklist || confirmedItems.length < (checklistTask?.aiDetails?.checklist?.length || 0)}
            >
              {isGeneratingChecklist ? "Preparing Mission..." : "Confirm & Commit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Verify Completion</DialogTitle>
            <DialogDescription>
              Upload a photo as proof of work done and add any final notes for the NGO.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Photo Proof (Required)</Label>
                {!proofImage && !isWebcamActive && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-[10px] font-bold uppercase tracking-wider text-primary"
                    onClick={startWebcam}
                    disabled={isCameraLoading}
                  >
                    {isCameraLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Camera className="w-3 h-3 mr-1" />}
                    Use Webcam
                  </Button>
                )}
                {isWebcamActive && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-[10px] font-bold uppercase tracking-wider text-red-500"
                    onClick={stopWebcam}
                  >
                    Cancel Camera
                  </Button>
                )}
              </div>
              
              <div 
                className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 transition-colors overflow-hidden relative ${
                  proofImage ? 'border-green-500 bg-green-50/10 min-h-[200px]' : 
                  isWebcamActive ? 'border-primary bg-slate-950 min-h-[300px]' :
                  'border-slate-200 hover:border-primary/50 hover:bg-slate-50 h-48 cursor-pointer'
                }`}
                onClick={() => !proofImage && !isWebcamActive && document.getElementById('photo-upload')?.click()}
              >
                {proofImage ? (
                  <div className="relative w-full h-full min-h-[200px]">
                    <img src={proofImage} alt="Proof" className="w-full h-full object-cover" />
                    <Button 
                      variant="destructive" 
                      size="icon" 
                      className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProofImage(null);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : isWebcamActive ? (
                  <div className="relative w-full h-full flex flex-col items-center group">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      className="w-full h-full bg-black object-cover"
                    />
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                      <Button 
                        size="icon" 
                        className="h-14 w-14 rounded-full bg-white hover:bg-slate-100 text-slate-900 border-4 border-primary/20 shadow-xl group-active:scale-95 transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          capturePhoto();
                        }}
                      >
                        <div className="w-8 h-8 rounded-full border-2 border-slate-900" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-slate-300" />
                    <span className="text-sm text-slate-400 text-center px-4">Click to upload, drag photo, or tap 'Use Webcam'</span>
                    <span className="text-[10px] text-slate-300 uppercase font-bold tracking-widest">JPG/PNG/WEBP, Max 2MB</span>
                  </>
                )}
                <input 
                  id="photo-upload" 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                  onChange={handleImageUpload} 
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Completion Notes</Label>
              <Textarea 
                placeholder="Briefly describe what was accomplished..."
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSubmitDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmitVerification} 
              disabled={isUploading || !proofImage}
              className="px-8"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : "Submit for Verification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Squad Recruitment Notification Popup */}
      <Dialog open={!!activeNotification} onOpenChange={(open) => !open && setActiveNotification(null)}>
        <DialogContent className="sm:max-w-md bg-slate-900 text-white border-blue-500/50 shadow-[0_0_50px_rgba(59,130,246,0.3)]">
          <DialogHeader>
            <div className="mx-auto w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4 border border-blue-500/20">
              <Users className="w-8 h-8 text-blue-400 animate-pulse" />
            </div>
            <DialogTitle className="text-2xl text-center font-black uppercase tracking-tighter italic">
              New Squad Forming!
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-center">
              A mission requires reinforcements within 10km of your position.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-4">
            <div className="p-4 bg-white/5 rounded-xl border border-white/10">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">{activeNotification?.title}</p>
              <p className="text-sm leading-relaxed">{activeNotification?.message}</p>
            </div>
            
            <div className="flex items-center justify-center gap-4 text-[10px] font-black uppercase tracking-widest opacity-60">
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Distance: ~{currentLocation && activeNotification?.location ? 
                  Math.round(calculateDistance(currentLocation.lat, currentLocation.lng, activeNotification.location.lat, activeNotification.location.lng)) : '?'} km
              </div>
              <div className="flex items-center gap-1">
                <Target className="w-3 h-3" />
                Radius: {activeNotification?.radius} km
              </div>
            </div>
          </div>

          <DialogFooter className="grid grid-cols-2 gap-4 sm:space-x-0">
            <Button 
              variant="outline" 
              className="border-white/10 hover:bg-white/5 text-white"
              onClick={() => setActiveNotification(null)}
            >
              Reject Mission
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-900"
              onClick={() => {
                handleJoinSquad(activeNotification.squadId);
                setActiveNotification(null);
              }}
              disabled={isJoiningSquad}
            >
              {isJoiningSquad ? "Joining..." : "Accept & Sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start Mission Confirmation Dialog */}
      <Dialog open={isStartMissionDialogOpen} onOpenChange={setIsStartMissionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black italic uppercase italic tracking-tighter">
              <Play className="w-6 h-6 text-emerald-600" />
              Initialize Operation
            </DialogTitle>
            <DialogDescription>
              Final deployment check. Once started, the mission becomes active for all members.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-6">
            {/* Squad Size Check */}
            {activeSquad && (
              <div className="p-4 rounded-xl border bg-slate-50 space-y-3">
                <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest">
                  <span>Current Strength</span>
                  <span className={squadMembers.length < (activeSquad.maxMembers / 2) ? 'text-amber-600' : 'text-emerald-600'}>
                    {squadMembers.length} / {Math.round(activeSquad.maxMembers / 2)}+ volunteers
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-500" 
                    style={{ width: `${Math.min(100, (squadMembers.length / (activeSquad.maxMembers / 2)) * 100)}%` }}
                  ></div>
                </div>
                <p className="text-[10px] text-slate-500">
                  {squadMembers.length < (activeSquad.maxMembers / 2) 
                    ? "Recommended: Wait for more members to ensure mission success." 
                    : "Squad state is optimal for deployment."}
                </p>
              </div>
            )}

            {/* Responsibility Checkbox */}
            <div 
              className="flex items-start gap-4 p-4 rounded-xl border-2 border-primary/20 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
              onClick={() => setIsTakingResponsibility(!isTakingResponsibility)}
            >
              <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isTakingResponsibility ? 'bg-primary border-primary' : 'bg-white border-slate-300'}`}>
                {isTakingResponsibility && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-900 leading-none">Commander's Responsibility</p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  I confirm that our current squad has the necessary resources and skills to complete this mission, and I take responsibility for the team's safety.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              className="w-full h-14 text-lg font-black italic uppercase tracking-widest shadow-xl" 
              disabled={!isTakingResponsibility}
              onClick={handleStartMissionConfirm}
            >
              Commence Mission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
