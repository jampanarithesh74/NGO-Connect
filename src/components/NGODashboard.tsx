import React, { useState, useEffect } from 'react';
import { useAuth } from '@/src/lib/AuthContext';
import { auth, db } from '@/src/lib/firebase';
import { signOut } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp, updateDoc, doc, writeBatch, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/src/lib/firestoreUtils';
import { 
  LayoutDashboard, 
  Upload, 
  History, 
  Clock, 
  CheckCircle2, 
  LogOut, 
  Send,
  AlertCircle,
  BarChart3,
  ChevronRight,
  FileText,
  Calendar,
  MoreVertical,
  Edit2,
  Trash2,
  XCircle,
  Play,
  Users,
  MapPin,
  Search,
  Loader2,
  Award,
  Heart,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { awardPointsAndBadges, trackTaskAbandonment } from '@/src/lib/gamification';
import { ChatBot } from './ChatBot';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import MapComponent from './MapComponent';

// Lazy initialization for Gemini AI to prevent crash if key is missing
let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not defined. Please set it in your environment variables.");
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
};

type Section = 'home' | 'upload' | 'previous' | 'progress' | 'completed' | 'verifications' | 'stalled';

interface AnalysisResult {
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  urgency: 'Immediate' | 'Soon' | 'Planned';
  category: 'Vital' | 'Essential' | 'Stabilizing';
  taskType: 'Health' | 'Food' | 'Logistics' | 'Education' | 'Rescue' | 'Shelter' | 'Environment' | 'Others';
  deadline: string;
  complexity: 'Simple' | 'Standard' | 'Complex';
  beneficiaries: number;
  recommendedTeamSize: number;
  minMembers: number;
  checklist: string[];
}

interface Report {
  id: string;
  content: string;
  analysis: AnalysisResult[];
  status: 'pending' | 'processed';
  hasFile?: boolean;
  createdAt: Timestamp;
  location?: {
    lat: number;
    lng: number;
    area: string;
    landmark?: string;
    district: string;
    state: string;
  };
}

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
  taskType: 'Health' | 'Food' | 'Logistics' | 'Education' | 'Rescue' | 'Shelter' | 'Environment' | 'Others';
  deadline?: Timestamp;
  complexity: 'Simple' | 'Standard' | 'Complex';
  beneficiaries: number;
  status: 'open' | 'accepted' | 'in_progress' | 'completed' | 'verified' | 'expired' | 'cancelled';
  aiDetails: {
    recommendedTeamSize: number;
    minMembers: number;
    checklist: string[];
  };
  acceptedAt?: Timestamp;
  mustStartBy?: Timestamp;
  startedAt?: Timestamp;
  startProof?: string;
  completedAt?: Timestamp;
  completionProof?: string;
  assignedVolunteerId?: string;
  currentRadius: number;
  timerExpiresAt?: Timestamp;
  squadId?: string;
  handledByNGO?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  rejectionReason?: string;
  completionNotes?: string;
  location?: {
    lat: number;
    lng: number;
    area: string;
    landmark?: string;
    district: string;
    state: string;
  };
}

export default function NGODashboard() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [previousReports, setPreviousReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<{ lat?: number; lng?: number; area?: string; landmark?: string; district?: string; state?: string } | null>(null);
  const [area, setArea] = useState('');
  const [landmark, setLandmark] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  
  const isTaskAtRisk = (task: Task) => {
    if (!['open', 'accepted', 'in_progress'].includes(task.status) || !task.deadline || !task.createdAt) return false;
    const now = Date.now();
    // Use toMillis() only if available (handles latency-compensated local snapshots)
    const created = typeof task.createdAt.toMillis === 'function' ? task.createdAt.toMillis() : now;
    const deadline = typeof task.deadline.toMillis === 'function' ? task.deadline.toMillis() : now + 86400000;
    const totalTime = deadline - created;
    const elapsed = now - created;
    
    // If 75% of the time has passed and still not completed
    // Or if it's within 6 hours of deadline
    const isLateInCycle = totalTime > 0 && (elapsed / totalTime) > 0.75;
    const isSoonValue = deadline - now < 1000 * 60 * 60 * 6; // 6 hours
    
    // Also consider it stalled if it was accepted but not started within its 'mustStartBy' time
    const isStalledAcceptance = task.status === 'accepted' && task.mustStartBy && now > task.mustStartBy.toMillis();
    
    return isLateInCycle || isSoonValue || isStalledAcceptance;
  };
  
  // Verification state
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [reviewingTask, setReviewingTask] = useState<Task | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessingApproval, setIsProcessingApproval] = useState(false);
  const [lastNotificationTime, setLastNotificationTime] = useState(0);

  // Monitoring for stale tasks
  useEffect(() => {
    const staleTasks = tasks.filter(t => isTaskAtRisk(t));
    const now = Date.now();
    
    // Notify every 5 minutes if there are stale tasks and at least one is truly "At Risk"
    if (staleTasks.length > 0 && (now - lastNotificationTime) > 1000 * 60 * 5) {
      const titles = staleTasks.map(t => t.title).slice(0, 3).join(', ');
      const overflow = staleTasks.length > 3 ? ` and ${staleTasks.length - 3} more` : '';
      
      toast.error(`CRITICAL: At Risk Tasks!`, {
        description: `${staleTasks.length} task(s) need attention: ${titles}${overflow}`,
        duration: 8000
      });
      setLastNotificationTime(now);
    }
  }, [tasks, activeSection, lastNotificationTime]);

  // Editing state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editBeneficiaries, setEditBeneficiaries] = useState(0);
  const [editComplexity, setEditComplexity] = useState<'Simple' | 'Standard' | 'Complex'>('Standard');

  useEffect(() => {
    if (!user) return;

    // Fetch reports
    const reportsQuery = query(
      collection(db, 'reports'),
      where('ngoId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeReports = onSnapshot(reportsQuery, (snapshot) => {
      const reports = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Report[];
      setPreviousReports(reports);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reports');
    });

    // Fetch tasks
    const tasksQuery = query(
      collection(db, 'tasks'),
      where('ngoId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      setTasks(tasksData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tasks');
    });

    return () => {
      unsubscribeReports();
      unsubscribeTasks();
    };
  }, [user]);

  const handleApplyManualLocation = () => {
    if (!area.trim() || !district.trim() || !state.trim()) {
      toast.error("Please fill in at least Area, District, and State.");
      return;
    }
    
    setSelectedLocation({ 
      ...selectedLocation,
      area: area.trim(),
      landmark: landmark.trim(),
      district: district.trim(),
      state: state.trim()
    });
    toast.success("Location details saved!");
  };

  const handleReverseGeocode = async (lat: number, lng: number) => {
    setIsReverseGeocoding(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`);
      const data = await response.json();
      
      if (data && data.address) {
        const addr = data.address;
        setArea(addr.suburb || addr.neighbourhood || addr.road || addr.village || '');
        setDistrict(addr.city_district || addr.district || addr.city || addr.town || '');
        setState(addr.state || '');
        toast.success("Address details updated from map pin!");
      }
    } catch (error) {
      console.error("Reverse geocoding error:", error);
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  const handleGeocode = async () => {
    if (!area.trim() && !district.trim() && !state.trim()) {
      toast.error("Please enter some address details to search.");
      return;
    }

    setIsGeocoding(true);
    try {
      const query = `${area} ${landmark} ${district} ${state}`.trim();
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
      const data = await response.json();

      if (data && data.length > 0) {
        const result = data[0];
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        setSelectedLocation(prev => ({ ...prev, lat, lng }));
        toast.success("Location pinned on map based on your text!");
      } else {
        toast.error("Could not find that location on the map. Please try a different landmark or area.");
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      toast.error("Failed to search location. Please try pinning manually.");
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: Task['status'], isNGOSelfAssign: boolean = false) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      const updateData: any = {
        status: newStatus,
        updatedAt: serverTimestamp()
      };

      if (isNGOSelfAssign) {
        updateData.handledByNGO = true;
        // If an NGO starts it, we move it to active but mark it as handled by them
      }

      await updateDoc(doc(db, 'tasks', taskId), updateData);

      // Award points and badges if completed and was a volunteer task
      if (newStatus === 'completed' && task.volunteerId && !task.handledByNGO) {
        const loadingToast = toast.loading("Awarding volunteer impact points...");
        try {
          const result = await awardPointsAndBadges(task.volunteerId, task);
          toast.dismiss(loadingToast);
          if (result) {
            toast.success(`Volunteer awarded ${result.pointsAdded} points!`);
            if (result.newBadgesCount > 0) {
              toast.success(`Volunteer earned ${result.newBadgesCount} new badge(s)!`);
            }
          }
        } catch (error) {
          toast.dismiss(loadingToast);
          console.error("Failed to award points:", error);
          toast.error("Failed to award points to volunteer.");
        }
      }

      toast.success(`Task status updated to ${newStatus}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description);
    setEditBeneficiaries(task.beneficiaries || 0);
    setEditComplexity(task.complexity || 'Standard');
  };

  const handleSaveTaskEdit = async () => {
    if (!editingTask) return;
    try {
      await updateDoc(doc(db, 'tasks', editingTask.id), {
        title: editTitle,
        description: editDescription,
        beneficiaries: editBeneficiaries,
        complexity: editComplexity,
        updatedAt: serverTimestamp()
      });
      toast.success("Task updated successfully");
      setEditingTask(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${editingTask.id}`);
    }
  };

  const handleApproveTask = async (task: Task) => {
    console.log("Approving task:", task.id);
    setIsProcessingApproval(true);
    try {
      // 1. Update task status
      await updateDoc(doc(db, 'tasks', task.id), {
        status: 'verified',
        updatedAt: serverTimestamp()
      });

      // 2. Award points
      if (task.squadId) {
        const squadSnap = await getDoc(doc(db, 'squads', task.squadId));
        if (squadSnap.exists()) {
          const squad = squadSnap.data();
          const memberIds = squad.memberIds as string[];
          const leadId = squad.leadId as string;

          for (const memberId of memberIds) {
            await awardPointsAndBadges(memberId, task, memberId === leadId);
          }
          
          await updateDoc(doc(db, 'squads', task.squadId), {
            status: 'completed',
            updatedAt: serverTimestamp()
          });
          toast.success(`Task verified! Squad members awarded base points + lead bonus.`);
        }
      } else if (task.volunteerId) {
        // Solo task
        await awardPointsAndBadges(task.volunteerId, task, false);
        toast.success(`Task verified! Solo volunteer awarded base points.`);
      }

      setIsReviewDialogOpen(false);
      setReviewingTask(null);
    } catch (error) {
      console.error("Approval error:", error);
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
      toast.error("Failed to approve task.");
    } finally {
      setIsProcessingApproval(false);
    }
  };

  const handleRejectTask = async (task: Task) => {
    console.log("Rejecting task:", task.id, "Reason:", rejectionReason);
    if (!rejectionReason.trim()) {
      toast.error("Please provide a reason for rejection.");
      return;
    }

    setIsProcessingApproval(true);
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: 'in_progress', // Send back to in_progress
        rejectionReason: rejectionReason,
        updatedAt: serverTimestamp()
      });
      console.log("Task rejected successfully");

      toast.success("Task sent back to volunteer for corrections.");
      setIsReviewDialogOpen(false);
      setReviewingTask(null);
      setRejectionReason('');
    } catch (error) {
      console.error("Rejection error:", error);
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
      toast.error("Failed to reject task.");
    } finally {
      setIsProcessingApproval(false);
    }
  };

  const handleKickVolunteer = async (task: Task) => {
    if (!confirm("Are you sure you want to release this volunteer? The task will return to the 'Open' pool.")) return;
    
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: 'open',
        volunteerId: null,
        assignedVolunteerId: null,
        memberIds: [],
        acceptedAt: null,
        mustStartBy: null,
        updatedAt: serverTimestamp()
      });
      
      if (task.assignedVolunteerId) {
        await trackTaskAbandonment(task.assignedVolunteerId);
      }
      
      toast.success("Volunteer released. Task is now open again.");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };
  const handleAnalyze = async () => {
    if (!reportText.trim() && !selectedFile) {
      toast.error("Please enter report text or upload a file to analyze.");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResults([]); // Reset previous results to avoid rendering old data with new logic
    
    try {
      let fileData: any = null;
      if (selectedFile) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => {
            const result = reader.result as string;
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64);
          };
        });
        reader.readAsDataURL(selectedFile);
        const base64 = await base64Promise;
        fileData = {
          inlineData: {
            data: base64,
            mimeType: selectedFile.type
          }
        };
      }

      const currentTime = new Date().toISOString();
      const locationContext = selectedLocation?.lat 
        ? `Current Map Selection: Lat ${selectedLocation.lat}, Lng ${selectedLocation.lng}. Area: ${area}, District: ${district}, State: ${state}.`
        : "No map selection provided.";

      const prompt = `
        Analyze the following NGO report (which may be text, an image/scan of a document, or both) and extract key action items or tasks.
        
        Current Time Context: ${currentTime}
        ${locationContext}
        
        CRITICAL: LOCATION EXTRACTION
        - Look closely for ANY location details (Area, Landmark, District, State).
        - If multiple locations are mentioned, focus on the primary one or the one where most tasks are centered.
        - Populate the 'detectedLocation' object with these findings.
        
        TASK EXTRACTION RULES:
        1. "Vital": Life-saving (Medical, Water, Search & Rescue).
        2. "Essential": Basic needs (Food, Shelter).
        3. "Stabilizing": Logistics, Cleaning.
        
        Urgency/Priority Rules:
        - Within 12h: Urgency "Immediate", Priority "High".
        - 12-48h: Urgency "Soon", Priority "Medium".
        - Later: Urgency "Planned", Priority "Low".
        
        Return a JSON object in this format:
        {
          "tasks": [
            {
              "title": "...",
              "description": "...",
              "priority": "High" | "Medium" | "Low",
              "urgency": "Immediate" | "Soon" | "Planned",
              "category": "Vital" | "Essential" | "Stabilizing",
              "taskType": "Health" | "Food" | "Logistics" | "Education" | "Rescue" | "Shelter" | "Environment" | "Others",
              "deadline": "ISO8601 string",
              "complexity": "Simple" | "Standard" | "Complex",
              "beneficiaries": number,
              "recommendedTeamSize": number,
              "minMembers": number,
              "checklist": ["..."]
            }
          ],
          "detectedLocation": { 
            "area": "...", 
            "landmark": "...", 
            "district": "...", 
            "state": "...", 
            "search_query": "An optimized search string for OpenStreetMap, e.g., 'Chowmahalla Palace, Khilwat, Hyderabad, Telangana'"
          }
        }
        
        CRITICAL: If the input (image or text) mentions a specific landmark, building, or address, prioritize it in the "search_query" field. If no specific area is found, leave the fields empty.
        
        ${reportText ? `Text Report: ${reportText}` : "Data is contained in the attached file."}
      `;

      const parts: any[] = [{ text: prompt }];
      if (fileData) {
        parts.push(fileData);
      }

      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    priority: { type: "string", enum: ["High", "Medium", "Low"] },
                    urgency: { type: "string", enum: ["Immediate", "Soon", "Planned"] },
                    category: { type: "string", enum: ["Vital", "Essential", "Stabilizing"] },
                    taskType: { type: "string", enum: ["Health", "Food", "Logistics", "Education", "Rescue", "Shelter", "Environment", "Others"] },
                    deadline: { type: "string" },
                    complexity: { type: "string", enum: ["Simple", "Standard", "Complex"] },
                    beneficiaries: { type: "number" },
                    recommendedTeamSize: { type: "number" },
                    minMembers: { type: "number" },
                    checklist: { type: "array", items: { type: "string" } }
                  },
                  required: ["title", "description", "priority", "urgency", "category", "taskType", "deadline", "complexity", "beneficiaries", "recommendedTeamSize", "minMembers", "checklist"]
                }
              },
              detectedLocation: {
                type: "object",
                properties: {
                  area: { type: "string" },
                  landmark: { type: "string" },
                  district: { type: "string" },
                  state: { type: "string" },
                  search_query: { type: "string" }
                }
              }
            },
            required: ["tasks", "detectedLocation"]
          }
        }
      });
      
      const text = response.text || "";
      
      // Safety: Extract JSON using robust matching
      let jsonData: any = null;
      try {
        // First try direct parse in case it's clean
        try {
          jsonData = JSON.parse(text);
        } catch (innerE) {
          // If direct fail, try substring extraction
          const startIdx = text.indexOf('{');
          const endIdx = text.lastIndexOf('}');
          if (startIdx !== -1 && endIdx !== -1) {
            jsonData = JSON.parse(text.substring(startIdx, endIdx + 1));
          } else {
            throw innerE;
          }
        }
      } catch (e) {
        console.error("JSON parse error:", e, text);
        
        // Final attempt: see if we can find tasks array even if location is broken
        if (text.includes('"tasks"')) {
           toast.error("The AI response was slightly malformed, but we are trying to recover data.");
           // This is where a more complex recovery logic would go, 
           // but for now we'll throw a clearer error
        }
        
        throw new Error("The AI returned an incomplete report. This can happen if the input is very complex or long. Please try splitting the report or providing more clarity.");
      }

      if (!jsonData || typeof jsonData !== 'object') {
        throw new Error("AI failed to generate a valid report structure.");
      }

      // Final schema validation check
      if (!Array.isArray(jsonData.tasks)) {
        throw new Error("The AI response was missing the tasks list. Please try again.");
      }

      const parsedResults = jsonData.tasks.map((t: any) => ({
        title: t.title || "Untitled Task",
        description: t.description || "No description provided",
        priority: ["High", "Medium", "Low"].includes(t.priority) ? t.priority : "Medium",
        urgency: ["Immediate", "Soon", "Planned"].includes(t.urgency) ? t.urgency : "Soon",
        category: ["Vital", "Essential", "Stabilizing"].includes(t.category) ? t.category : "Essential",
        taskType: t.taskType || "Others",
        deadline: t.deadline || new Date().toISOString(),
        complexity: ["Simple", "Standard", "Complex"].includes(t.complexity) ? t.complexity : "Standard",
        beneficiaries: Number(t.beneficiaries) || 0,
        recommendedTeamSize: Number(t.recommendedTeamSize) || 2,
        minMembers: Number(t.minMembers) || 1,
        checklist: Array.isArray(t.checklist) ? t.checklist : []
      })) as AnalysisResult[];

      const detectedLoc = jsonData.detectedLocation;

      if (parsedResults.length === 0) {
        toast.info("No clear tasks were identified in this report.");
        setIsAnalyzing(false);
        return;
      }

      setAnalysisResults(parsedResults);

      // 1. Process Extracted Location
      let finalizedArea = area;
      let finalizedDistrict = district;
      let finalizedState = state;
      let finalizedLandmark = landmark;
      let autoCoords: { lat: number, lng: number } | null = null;

      if (detectedLoc) {
        if (detectedLoc.area && !area) { finalizedArea = detectedLoc.area; setArea(detectedLoc.area); }
        if (detectedLoc.landmark && !landmark) { finalizedLandmark = detectedLoc.landmark; setLandmark(detectedLoc.landmark); }
        if (detectedLoc.district && !district) { finalizedDistrict = detectedLoc.district; setDistrict(detectedLoc.district); }
        if (detectedLoc.state && !state) { finalizedState = detectedLoc.state; setState(detectedLoc.state); }

        // Trigger Geocoding if needed
        const aiSearchQuery = detectedLoc.search_query;
        const backupSearchQuery = `${detectedLoc.area || ''} ${detectedLoc.landmark || ''} ${detectedLoc.district || ''} ${detectedLoc.state || ''}`.trim();
        const finalSearchQuery = aiSearchQuery || backupSearchQuery;

        if (finalSearchQuery.length > 3 && !selectedLocation?.lat) {
          autoCoords = await handleGeocodeWithQuery(finalSearchQuery);
          if (!autoCoords && aiSearchQuery && backupSearchQuery !== aiSearchQuery) {
            // Try backup if AI query specifically failed
            autoCoords = await handleGeocodeWithQuery(backupSearchQuery);
          }

          if (autoCoords) {
            // Also update the local state variables for UI feedback
            if (detectedLoc.area && !area) setArea(detectedLoc.area);
            if (detectedLoc.landmark && !landmark) setLandmark(detectedLoc.landmark);
            if (detectedLoc.district && !district) setDistrict(detectedLoc.district);
            if (detectedLoc.state && !state) setState(detectedLoc.state);
            
            // Trigger reverse geocode for even more accuracy in the fields
            handleReverseGeocode(autoCoords.lat, autoCoords.lng);
          }
        }
      }

      // 2. Prepare Location Object for DB
      const sanitizedLocation: any = {};
      const finalLat = autoCoords?.lat || selectedLocation?.lat;
      const finalLng = autoCoords?.lng || selectedLocation?.lng;

      if (typeof finalLat === 'number') sanitizedLocation.lat = finalLat;
      if (typeof finalLng === 'number') sanitizedLocation.lng = finalLng;
      
      // Use detected loc variables (finalizedX) or fallback to current state
      if (finalizedArea || area) sanitizedLocation.area = finalizedArea || area;
      if (finalizedLandmark || landmark) sanitizedLocation.landmark = finalizedLandmark || landmark;
      if (finalizedDistrict || district) sanitizedLocation.district = finalizedDistrict || district;
      if (finalizedState || state) sanitizedLocation.state = finalizedState || state;

      // 3. Save Report
      const reportData: any = {
        ngoId: user?.uid,
        content: reportText || (selectedFile ? `File Upload: ${selectedFile.name}` : "Unknown report source"),
        hasFile: !!selectedFile,
        analysis: parsedResults,
        status: 'processed',
        createdAt: serverTimestamp(),
        location: sanitizedLocation
      };

      const reportRef = await addDoc(collection(db, 'reports'), reportData);

      // 4. Save Tasks
      const batch = writeBatch(db);
      parsedResults.forEach((item) => {
        const taskRef = doc(collection(db, 'tasks'));
        batch.set(taskRef, {
          reportId: reportRef.id,
          ngoId: user?.uid,
          ngoName: user?.displayName || user?.email?.split('@')[0],
          title: item.title || "Untitled Task",
          description: item.description || "No description provided.",
          priority: item.priority || "Medium",
          urgency: item.urgency || "Soon",
          category: item.category || 'Essential',
          taskType: item.taskType || 'Others',
          deadline: item.deadline ? Timestamp.fromDate(new Date(item.deadline)) : Timestamp.fromMillis(Date.now() + 72 * 60 * 60 * 1000),
          complexity: item.complexity || 'Standard',
          beneficiaries: Number(item.beneficiaries) || 0,
          status: 'open',
          aiDetails: {
            recommendedTeamSize: Number(item.recommendedTeamSize) || 1,
            minMembers: Number(item.minMembers) || 1,
            checklist: Array.isArray(item.checklist) ? item.checklist : []
          },
          currentRadius: 10,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          location: sanitizedLocation
        });
      });
      await batch.commit();
      
      toast.success("Tasks successfully extracted and published!");
      
      // Clean up inputs
      setReportText('');
      setSelectedFile(null);
      setFilePreview(null);

    } catch (error) {
      console.error("Analysis workflow error:", error);
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred during analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGeocodeWithQuery = async (queryStr: string): Promise<{ lat: number, lng: number } | null> => {
    setIsGeocoding(true);
    try {
      // Strategy 1: Direct search
      const runSearch = async (q: string) => {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`, {
          headers: { 'Accept-Language': 'en' }
        });
        return await response.json();
      };

      let data = await runSearch(queryStr);

      // Strategy 2: If no results and it looks like a long address, try trimming it
      if (!data || data.length === 0) {
        const parts = queryStr.split(',').map(p => p.trim());
        if (parts.length > 2) {
          // Remove the first part (often a specific shop or tiny detail) and try again
          data = await runSearch(parts.slice(1).join(', '));
        }
      }

      // Strategy 3: Try just the landmarks and area
      if (!data || data.length === 0) {
        const parts = queryStr.split(' ');
        if (parts.length > 3) {
          data = await runSearch(parts.slice(0, 3).join(' '));
        }
      }

      if (data && data.length > 0) {
        const result = data[0];
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        setSelectedLocation({ lat, lng });
        toast.info("AI pinned the location on the map.");
        return { lat, lng };
      }
      
      return null;
    } catch (error) {
       console.error("Auto-geocoding error:", error);
       return null;
    } finally {
      setIsGeocoding(false);
    }
  };

  const sidebarItems = [
    { id: 'upload', label: 'Upload Data', icon: Upload },
    { id: 'previous', label: 'Previous Uploads', icon: History },
    { id: 'progress', label: 'In Progress Works', icon: Clock },
    { id: 'stalled', label: 'Stalled Missions', icon: AlertCircle },
    { id: 'completed', label: 'Completed Tasks', icon: CheckCircle2 },
    { id: 'verifications', label: 'Verifications', icon: Award },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      {/* Mobile Sidebar Toggle Button */}
      {!isSidebarOpen && (
        <div className="md:hidden fixed top-4 left-4 z-50">
          <Button 
            variant="outline" 
            size="icon" 
            className="w-12 h-12 rounded-full shadow-lg bg-white border-2 border-primary/20 text-primary hover:bg-primary/5 active:scale-95 transition-all"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Heart className="w-6 h-6 fill-primary text-red-500" />
          </Button>
        </div>
      )}

      {/* Mobile Drawer Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60]"
              onClick={() => setIsSidebarOpen(false)}
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="md:hidden fixed inset-y-0 left-0 w-80 bg-white shadow-2xl z-[70] flex flex-col"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2 text-primary">
                    <Heart className="w-8 h-8 fill-primary text-red-500" />
                    <span className="font-black text-2xl tracking-tighter italic uppercase underline decoration-4 decoration-primary/20">NGO Portal</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)} className="rounded-full">
                    <X className="w-5 h-5" />
                  </Button>
                </div>
                
                <nav className="space-y-1">
                  {sidebarItems.map((item) => {
                    const Icon = item.icon;
                    const hasAtRiskTasks = item.id === 'progress' && tasks.some(t => isTaskAtRisk(t));
                    const notificationCount = item.id === 'verifications' ? tasks.filter(t => t.status === 'completed').length : 0;
                    
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveSection(item.id as Section);
                          setIsSidebarOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-4 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] ${
                          activeSection === item.id 
                            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25' 
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <Icon className="w-5 h-5" />
                          {item.label}
                        </div>
                        <div className="flex items-center gap-2">
                          {notificationCount > 0 && (
                            <div className="bg-amber-500 rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white flex items-center gap-1 shrink-0">
                              {notificationCount}
                            </div>
                          )}
                          {hasAtRiskTasks && (
                            <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </nav>
              </div>
              
              <div className="mt-auto p-6 border-t border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3 mb-6 p-3 rounded-2xl bg-white border border-slate-100 shadow-sm">
                  <div className="w-12 h-12 rounded-xl bg-slate-200 shadow-inner flex items-center justify-center font-black text-slate-600 text-lg">
                    {user?.email?.[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 truncate tracking-tight">{user?.email}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">NGO Partner</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full h-12 rounded-xl justify-start text-red-600 border-red-100 hover:text-red-700 hover:bg-red-50 font-bold uppercase tracking-widest text-[10px]"
                  onClick={() => signOut(auth)}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout / Terminate Session
                </Button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r flex-col shadow-sm">
        <div className="p-6">
          <div className="flex items-center gap-2 text-primary mb-8">
            <LayoutDashboard className="w-8 h-8" />
            <span className="font-bold text-xl tracking-tight">NGO Portal</span>
          </div>
          
          <nav className="space-y-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const hasAtRiskTasks = item.id === 'progress' && tasks.some(t => isTaskAtRisk(t));
              const notificationCount = item.id === 'verifications' ? tasks.filter(t => t.status === 'completed').length : 0;
              
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id as Section)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    activeSection === item.id 
                      ? 'bg-primary text-primary-foreground shadow-md' 
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </div>
                  {notificationCount > 0 && (
                    <div className="bg-amber-500 rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white flex items-center gap-1 shrink-0 animate-bounce">
                      {notificationCount}
                    </div>
                  )}
                  {hasAtRiskTasks && (
                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
        
        <div className="mt-auto p-6 border-t">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
              {user?.email?.[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.email}</p>
              <p className="text-xs text-slate-500">NGO Partner</p>
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
      <main className="flex-1 overflow-y-auto p-0 md:p-8 bg-white md:bg-slate-50">
        <AnimatePresence mode="wait">
          {activeSection === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full md:max-w-4xl md:mx-auto text-center mt-8 md:mt-20 p-4 md:p-0"
            >
              <h1 className="text-5xl font-extrabold text-slate-900 mb-6">
                Welcome to your <span className="text-primary">NGO Dashboard</span>
              </h1>
              <p className="text-xl text-slate-600 mb-8 leading-relaxed">
                Empowering your mission with AI-driven insights. Upload your reports, 
                track progress, and manage tasks efficiently to maximize your social impact.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                <Card className="bg-white/50 backdrop-blur">
                  <CardHeader>
                    <BarChart3 className="w-8 h-8 text-primary mb-2" />
                    <CardTitle className="text-lg">Smart Analysis</CardTitle>
                    <CardDescription>AI-powered report breakdown</CardDescription>
                  </CardHeader>
                </Card>
                <Card className="bg-white/50 backdrop-blur">
                  <CardHeader>
                    <Clock className="w-8 h-8 text-blue-500 mb-2" />
                    <CardTitle className="text-lg">Real-time Tracking</CardTitle>
                    <CardDescription>Monitor ongoing projects</CardDescription>
                  </CardHeader>
                </Card>
                <Card className="bg-white/50 backdrop-blur">
                  <CardHeader>
                    <CheckCircle2 className="w-8 h-8 text-green-500 mb-2" />
                    <CardTitle className="text-lg">Impact Reports</CardTitle>
                    <CardDescription>Visualize your achievements</CardDescription>
                  </CardHeader>
                </Card>
              </div>

              {tasks.filter(t => t.status === 'completed').length > 0 && (
                <div className="mt-12 text-left">
                  <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                    Action Required: Pending Verifications
                  </h3>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-center justify-between">
                    <div>
                      <p className="text-amber-800 font-semibold text-lg">
                        You have {tasks.filter(t => t.status === 'completed').length} tasks awaiting verification.
                      </p>
                      <p className="text-amber-700/70 text-sm">
                        Review volunteer proof to award points and finalize impact.
                      </p>
                    </div>
                    <Button onClick={() => setActiveSection('verifications')} className="bg-amber-600 hover:bg-amber-700">
                      Go to Verifications
                      <ChevronRight className="ml-2 w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeSection === 'stalled' && (
            <motion.div
              key="stalled"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full md:max-w-5xl md:mx-auto p-4 md:p-0"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900">Stalled Missions</h2>
                <p className="text-slate-500">Missions accepted by volunteers but not yet started. Intervene if necessary.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tasks.filter(t => t.status === 'accepted').length === 0 ? (
                  <div className="col-span-full h-80 flex flex-col items-center justify-center bg-white rounded-3xl border-2 border-dashed border-slate-100 p-8 text-center">
                    <CheckCircle2 className="w-16 h-16 text-slate-200 mb-4" />
                    <p className="text-slate-400 font-medium italic">No stalled missions detected.</p>
                  </div>
                ) : (
                  tasks.filter(t => t.status === 'accepted').map((task) => (
                    <Card key={task.id} className="border-l-4 border-l-amber-500">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg truncate">{task.title}</CardTitle>
                        <CardDescription className="flex flex-col gap-1.5 mt-1">
                           <div className="flex items-center gap-1.5 text-amber-600 font-bold">
                             <Clock className="w-3.5 h-3.5" />
                             Started By: {task.mustStartBy ? new Date(task.mustStartBy.toMillis()).toLocaleTimeString() : 'N/A'}
                           </div>
                           <div className="text-[10px] text-slate-400 uppercase tracking-tighter">
                             Accepted At: {task.acceptedAt ? task.acceptedAt.toDate().toLocaleString() : 'N/A'}
                           </div>
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="p-3 bg-slate-50 rounded-lg space-y-2">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Assigned Volunteer</p>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                              {task.assignedVolunteerId ? 'V' : 'S'}
                            </div>
                            <span className="text-sm font-medium text-slate-700 truncate">
                              {task.assignedVolunteerId || 'Squad Lead Access'}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-0 border-t bg-slate-50/30 p-4">
                        <Button 
                          variant="destructive" 
                          className="w-full text-xs font-bold uppercase tracking-widest"
                          onClick={() => handleKickVolunteer(task)}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Release Task
                        </Button>
                      </CardFooter>
                    </Card>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeSection === 'verifications' && (
            <motion.div
              key="verifications"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full md:max-w-5xl md:mx-auto p-4 md:p-0"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900">Verification Center</h2>
                <p className="text-slate-500">Review proof submitted by volunteers to verify task completion.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tasks.filter(t => t.status === 'completed').length === 0 ? (
                  <div className="col-span-full py-20 text-center text-slate-400 bg-white rounded-2xl border-2 border-dashed">
                    <Award className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-lg font-medium">All caught up!</p>
                    <p className="text-sm">New submissions will appear here for your review.</p>
                  </div>
                ) : (
                  tasks.filter(t => t.status === 'completed').map((task) => (
                    <Card key={task.id} className="overflow-hidden border-2 border-amber-100 hover:border-amber-200 transition-all shadow-sm hover:shadow-md">
                      {task.completionProof && (
                        <div className="h-40 overflow-hidden relative group">
                          <img 
                            src={task.completionProof} 
                            alt="Proof" 
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                        </div>
                      )}
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg truncate">{task.title}</CardTitle>
                        <CardDescription className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Submitted {task.updatedAt ? task.updatedAt.toDate().toLocaleDateString() : "Just now"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <p className="text-sm text-slate-600 line-clamp-2">
                          {task.completionNotes || "No notes provided."}
                        </p>
                      </CardContent>
                      <CardFooter className="pt-0 border-t bg-amber-50/30 p-4">
                        <Button 
                          className="w-full bg-amber-600 hover:bg-amber-700"
                          onClick={() => {
                            setReviewingTask(task);
                            setIsReviewDialogOpen(true);
                          }}
                        >
                          Review Proof
                        </Button>
                      </CardFooter>
                    </Card>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeSection === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full md:max-w-5xl md:mx-auto p-4 md:p-0"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900">Upload & Analyze Data</h2>
                <p className="text-slate-500">Submit your NGO report for AI-powered priority analysis.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>NGO Report Input</CardTitle>
                    <CardDescription>
                      Paste your field reports, meeting notes, or project updates below.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="report">Text Report (Optional if uploading file)</Label>
                        <textarea
                          id="report"
                          className="w-full min-h-[150px] p-4 rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          placeholder="e.g., We visited the rural health center today. There is a critical shortage of clean water and basic medical supplies..."
                          value={reportText}
                          onChange={(e) => setReportText(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Document / Photo Report (OCR Analysis)</Label>
                        <div 
                          className={`border-2 border-dashed rounded-xl p-8 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer group ${
                            filePreview ? 'border-primary/50 bg-primary/5' : 'border-slate-200 hover:border-primary/30 hover:bg-slate-50'
                          }`}
                          onClick={() => document.getElementById('report-file')?.click()}
                          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-primary'); }}
                          onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-primary'); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.currentTarget.classList.remove('border-primary');
                            const file = e.dataTransfer.files[0];
                            if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
                              setSelectedFile(file);
                              const reader = new FileReader();
                              reader.onloadend = () => setFilePreview(reader.result as string);
                              reader.readAsDataURL(file);
                            }
                          }}
                        >
                          <input 
                            type="file" 
                            id="report-file" 
                            className="hidden" 
                            accept="image/*,application/pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setSelectedFile(file);
                                const reader = new FileReader();
                                reader.onloadend = () => setFilePreview(reader.result as string);
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                          {filePreview ? (
                            <div className="relative w-full aspect-video rounded-lg overflow-hidden border shadow-sm">
                              {selectedFile?.type.startsWith('image/') ? (
                                <img src={filePreview} alt="Preview" className="w-full h-full object-contain" />
                              ) : (
                                <div className="w-full h-full flex flex-center bg-slate-100 items-center justify-center text-slate-500 font-medium">
                                  <FileText className="w-8 h-8 mr-2" />
                                  PDF Document Attached
                                </div>
                              )}
                              <Button 
                                variant="destructive" 
                                size="icon" 
                                className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-lg"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedFile(null);
                                  setFilePreview(null);
                                }}
                              >
                                <XCircle className="h-5 w-5" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                <Upload className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-medium text-slate-900">Click to upload or drag and drop</p>
                                <p className="text-xs text-slate-500 mt-1">Images or PDF (Max 10MB)</p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button 
                      className="w-full py-6 text-lg mt-6 shadow-indigo-100 shadow-lg" 
                      onClick={handleAnalyze}
                      disabled={isAnalyzing || (!reportText.trim() && !selectedFile)}
                    >
                      {isAnalyzing ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                          Analyzing with AI...
                        </>
                      ) : (
                        <>
                          Analyse Data
                          <Send className="ml-2 h-5 w-5" />
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-primary" />
                      Location Details
                    </CardTitle>
                    <CardDescription>
                      Provide an address or pin the location on the map.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-slate-400">Area / Street</Label>
                        <Input 
                          placeholder="e.g. MG Road" 
                          value={area}
                          onChange={(e) => setArea(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-slate-400">Nearest Landmark</Label>
                        <Input 
                          placeholder="e.g. Near Post Office" 
                          value={landmark}
                          onChange={(e) => setLandmark(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-slate-400">District</Label>
                        <Input 
                          placeholder="e.g. Pune" 
                          value={district}
                          onChange={(e) => setDistrict(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-slate-400">State</Label>
                        <Input 
                          placeholder="e.g. Maharashtra" 
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>

                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full h-9 text-xs border-dashed border-primary/50 text-primary hover:bg-primary/5"
                      onClick={handleGeocode}
                      disabled={isGeocoding}
                    >
                      {isGeocoding ? (
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      ) : (
                        <Search className="w-3 h-3 mr-2" />
                      )}
                      Find on Map from Address
                    </Button>

                    <Separator />

                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase text-slate-400">Visual Pin {isReverseGeocoding && "(Updating address...)"}</Label>
                      <div className="h-[200px] rounded-xl overflow-hidden border-2 border-slate-200 relative group">
                        <MapComponent 
                          isPicker={true}
                          center={selectedLocation?.lat && selectedLocation?.lng ? [selectedLocation.lat, selectedLocation.lng] : undefined}
                          pickerValue={selectedLocation?.lat && selectedLocation?.lng ? [selectedLocation.lat, selectedLocation.lng] : null}
                          onLocationSelect={(lat, lng) => {
                            setSelectedLocation(prev => ({ ...prev, lat, lng }));
                            handleReverseGeocode(lat, lng);
                          }}
                        />
                      </div>
                    </div>

                    {(area || district || state || selectedLocation?.lat) && (
                      <div className="flex flex-col gap-1 text-sm text-green-600 font-medium bg-green-50 p-3 rounded-lg border border-green-100">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Location Set</span>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="ml-auto h-6 text-xs hover:bg-green-100"
                            onClick={() => {
                              setSelectedLocation(null);
                              setArea('');
                              setLandmark('');
                              setDistrict('');
                              setState('');
                            }}
                          >
                            Clear All
                          </Button>
                        </div>
                        <div className="text-[10px] text-green-500 ml-6 space-y-1">
                          {area && district && state && (
                            <p className="text-green-600 font-bold">
                              ✓ {area}, {district}, {state}
                            </p>
                          )}
                          {selectedLocation?.lat && (
                            <p className="text-green-600 font-bold">
                              ✓ Map pin placed ({selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)})
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {analysisResults.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-primary" />
                      Analysis Results
                    </h3>
                    <span className="text-sm text-slate-500">Sorted by Priority & Urgency</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysisResults.map((result, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <Card className="h-full border-l-4 overflow-hidden" 
                          style={{ 
                            borderLeftColor: result.priority === 'High' ? '#ef4444' : result.priority === 'Medium' ? '#f59e0b' : '#10b981' 
                          }}
                        >
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start mb-2">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                                result.priority === 'High' ? 'bg-red-100 text-red-700' : 
                                result.priority === 'Medium' ? 'bg-amber-100 text-amber-700' : 
                                'bg-emerald-100 text-emerald-700'
                              }`}>
                                {result.priority} Priority
                              </span>
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-[10px] font-medium text-slate-400 uppercase">
                                  {result.urgency}
                                </span>
                                <span className="text-[10px] font-bold text-primary uppercase">
                                  Impact: {10 + (result.priority === 'High' ? 40 : result.priority === 'Medium' ? 20 : 0) + Math.min(60, (result.beneficiaries || 0) * 2) + (result.complexity === 'Complex' ? 50 : result.complexity === 'Standard' ? 20 : 0)} Pts
                                </span>
                              </div>
                            </div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              {result.title}
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border italic">
                                #{result.taskType || 'Others'}
                              </span>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-slate-600 leading-relaxed mb-4">
                              {result.description}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-2 rounded bg-slate-50 border border-slate-100">
                                <Label className="text-[10px] text-slate-400 uppercase font-bold">Reach</Label>
                                <Input 
                                  type="number" 
                                  className="h-7 text-xs mt-1 bg-white" 
                                  value={result.beneficiaries} 
                                  onChange={(e) => {
                                    const newResults = [...analysisResults];
                                    newResults[index].beneficiaries = parseInt(e.target.value) || 0;
                                    setAnalysisResults(newResults);
                                  }}
                                />
                              </div>
                              <div className="p-2 rounded bg-slate-50 border border-slate-100">
                                <Label className="text-[10px] text-slate-400 uppercase font-bold">Effort</Label>
                                <select 
                                  className="w-full h-7 text-xs mt-1 bg-white border rounded px-1"
                                  value={result.complexity}
                                  onChange={(e) => {
                                    const newResults = [...analysisResults];
                                    newResults[index].complexity = e.target.value as any;
                                    setAnalysisResults(newResults);
                                  }}
                                >
                                  <option value="Simple">Simple (&lt;1h)</option>
                                  <option value="Standard">Standard (1-4h)</option>
                                  <option value="Complex">Complex (&gt;4h)</option>
                                </select>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeSection === 'previous' && (
            <motion.div
              key="previous"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full md:max-w-5xl md:mx-auto p-4 md:p-0"
            >
              <div className="mb-8 flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">Previous Uploads</h2>
                  <p className="text-slate-500">View and manage your historical report data and AI insights.</p>
                </div>
                {selectedReport && (
                  <Button variant="ghost" onClick={() => setSelectedReport(null)}>
                    ← Back to list
                  </Button>
                )}
              </div>

              {!selectedReport ? (
                <div className="grid grid-cols-1 gap-4">
                  {previousReports.length === 0 ? (
                    <Card className="bg-white/50 border-dashed border-2 flex flex-col items-center justify-center py-20 text-slate-400">
                      <History className="w-12 h-12 mb-4 opacity-20" />
                      <p>No reports uploaded yet.</p>
                    </Card>
                  ) : (
                    previousReports.map((report) => (
                      <Card 
                        key={report.id} 
                        className="hover:shadow-md transition-shadow cursor-pointer group"
                        onClick={() => setSelectedReport(report)}
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg text-primary">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <CardTitle className="text-lg">Report Analysis</CardTitle>
                              <CardDescription className="flex items-center gap-2">
                                <Calendar className="w-3 h-3" />
                                {report.createdAt ? (
                                  <>
                                    {report.createdAt.toDate().toLocaleDateString()} at {report.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </>
                                ) : (
                                  "Just now..."
                                )}
                                {report.hasFile && (
                                  <span className="flex items-center gap-1 text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 ml-2">
                                    <Upload className="w-2 h-2" />
                                    File Attached
                                  </span>
                                )}
                              </CardDescription>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                              report.status === 'processed' ? 'bg-green-100 text-green-700' : 
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {report.status}
                            </span>
                            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors" />
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-slate-600 line-clamp-2 italic">
                            "{report.content}"
                          </p>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Original Report Content</CardTitle>
                      <CardDescription>The data you provided for analysis.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="p-4 bg-slate-50 rounded-lg text-sm text-slate-700 leading-relaxed whitespace-pre-wrap border">
                        {selectedReport.content}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-primary" />
                      AI Analysis Results
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedReport.analysis.map((result, index) => (
                        <Card key={index} className="h-full border-l-4" 
                          style={{ 
                            borderLeftColor: result.priority === 'High' ? '#ef4444' : result.priority === 'Medium' ? '#f59e0b' : '#10b981' 
                          }}
                        >
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start mb-2">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                                result.priority === 'High' ? 'bg-red-100 text-red-700' : 
                                result.priority === 'Medium' ? 'bg-amber-100 text-amber-700' : 
                                'bg-emerald-100 text-emerald-700'
                              }`}>
                                {result.priority} Priority
                              </span>
                              <span className="text-[10px] font-medium text-slate-400 uppercase">
                                {result.urgency}
                              </span>
                              {result.category && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  result.category === 'Vital' ? 'bg-purple-100 text-purple-700' :
                                  result.category === 'Essential' ? 'bg-blue-100 text-blue-700' :
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {result.category}
                                </span>
                              )}
                            </div>
                            <CardTitle className="text-lg">{result.title}</CardTitle>
                            {result.deadline && (
                              <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Target: {new Date(result.deadline).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-slate-600 leading-relaxed">
                              {result.description}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {(activeSection === 'progress' || activeSection === 'completed') && (
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full md:max-w-5xl md:mx-auto p-4 md:p-0"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-900">
                  {activeSection === 'progress' ? 'In Progress Works' : 'Completed Tasks'}
                </h2>
                <p className="text-slate-500">
                  {activeSection === 'progress' 
                    ? 'Track and manage tasks currently being worked on.' 
                    : 'A history of all successfully finished tasks.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tasks.filter(t => (activeSection === 'progress' ? ['open', 'accepted', 'in_progress'].includes(t.status) : t.status === 'verified')).length === 0 ? (
                  <div className="col-span-full py-20 text-center text-slate-400">
                    <p>No tasks found in this section.</p>
                  </div>
                ) : (
                  tasks
                    .filter(t => (activeSection === 'progress' ? ['open', 'accepted', 'in_progress'].includes(t.status) : t.status === 'verified'))
                    .map((task) => {
                      const atRisk = isTaskAtRisk(task);
                      return (
                        <Card key={task.id} className={`border-l-4 transition-all duration-300 ${atRisk ? 'bg-red-50 border-red-200 shadow-md ring-1 ring-red-100' : ''}`} 
                          style={{ 
                            borderLeftColor: atRisk ? '#ef4444' : (task.priority === 'High' ? '#ef4444' : task.priority === 'Medium' ? '#f59e0b' : '#10b981') 
                          }}
                        >
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex gap-2">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                                task.priority === 'High' ? 'bg-red-100 text-red-700' : 
                                task.priority === 'Medium' ? 'bg-amber-100 text-amber-700' : 
                                'bg-emerald-100 text-emerald-700'
                              }`}>
                                {task.priority}
                              </span>
                              <span className="text-[10px] font-medium text-slate-400 uppercase bg-slate-100 px-2 py-1 rounded">
                                {task.urgency}
                              </span>
                              {isTaskAtRisk(task) && (
                                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded flex items-center gap-1 animate-pulse">
                                  <AlertCircle className="w-3 h-3" /> AT RISK
                                </span>
                              )}
                            </div>
                            
                            <DropdownMenu>
                              <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                                <MoreVertical className="h-4 w-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditTask(task)}>
                                  <Edit2 className="mr-2 h-4 w-4" />
                                  Edit Details
                                </DropdownMenuItem>
                                {task.status === 'in_progress' && (
                                  <>
                                    <DropdownMenuItem onClick={() => handleUpdateTaskStatus(task.id, 'verified')}>
                                      <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                      Mark Completed
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleKickVolunteer(task)} className="text-red-600">
                                      <XCircle className="mr-2 h-4 w-4" />
                                      Release Volunteer
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {task.status === 'open' && (
                                  <DropdownMenuItem onClick={() => handleUpdateTaskStatus(task.id, 'cancelled')} className="text-red-600">
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Cancel Task
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div className="flex flex-col mt-2">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-lg">{task.title}</CardTitle>
                              {task.handledByNGO && (
                                <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded uppercase">NGO Internal</span>
                              )}
                            </div>
                            <div className="flex gap-2 mt-1">
                              <span className="text-[10px] font-bold text-primary uppercase bg-primary/5 px-2 py-0.5 rounded">
                                Reward: {10 + (task.priority === 'High' ? 40 : task.priority === 'Medium' ? 20 : 0) + Math.min(60, (task.beneficiaries || 0) * 2) + (task.complexity === 'Complex' ? 50 : task.complexity === 'Standard' ? 20 : 0)} Pts
                              </span>
                              <span className="text-[10px] font-medium text-slate-400 uppercase flex items-center gap-1">
                                <Users className="w-3 h-3" /> {task.beneficiaries || 0} reach
                              </span>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-slate-600 line-clamp-3">
                            {task.description}
                          </p>
                          {task.volunteerId && !task.handledByNGO && (
                            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 bg-slate-50 p-2 rounded">
                              <Users className="w-3 h-3" />
                              Assigned to Volunteer
                            </div>
                          )}
                          {task.handledByNGO && (
                            <div className="mt-4 flex items-center gap-2 text-xs text-indigo-500 bg-indigo-50 p-2 rounded font-medium">
                              <LayoutDashboard className="w-3 h-3" />
                              Handling Internally (NGO Staff)
                            </div>
                          )}
                        </CardContent>
                        <CardFooter className="pt-0 flex justify-between items-center">
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {task.createdAt ? task.createdAt.toDate().toLocaleDateString() : "Just now..."}
                          </div>
                          {task.status === 'open' && (
                            <Button size="sm" onClick={() => handleUpdateTaskStatus(task.id, 'in_progress', true)}>
                              <Play className="w-3 h-3 mr-1" />
                              Self-Assign
                            </Button>
                          )}
                          {task.status === 'in_progress' && task.handledByNGO && (
                            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => handleUpdateTaskStatus(task.id, 'verified', true)}>
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Finish Now
                            </Button>
                          )}
                        </CardFooter>
                      </Card>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit Dialog */}
        <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Task Details</DialogTitle>
              <DialogDescription>
                Update the title and description for this task.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Task Title</Label>
                <Input 
                  id="title" 
                  value={editTitle} 
                  onChange={(e) => setEditTitle(e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea 
                  id="desc" 
                  value={editDescription} 
                  onChange={(e) => setEditDescription(e.target.value)} 
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-reach">Reach (Beneficiaries)</Label>
                  <Input 
                    id="edit-reach" 
                    type="number"
                    value={editBeneficiaries} 
                    onChange={(e) => setEditBeneficiaries(parseInt(e.target.value) || 0)} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-effort">Effort (Complexity)</Label>
                  <select 
                    id="edit-effort"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    value={editComplexity}
                    onChange={(e) => setEditComplexity(e.target.value as any)}
                  >
                    <option value="Simple">Simple</option>
                    <option value="Standard">Standard</option>
                    <option value="Complex">Complex</option>
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingTask(null)}>Cancel</Button>
              <Button onClick={handleSaveTaskEdit}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Review Dialog */}
        <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-600" />
                Review Task Completion
              </DialogTitle>
              <DialogDescription>
                Verify the proof provided by the volunteer to award points.
              </DialogDescription>
            </DialogHeader>
            
            {reviewingTask && (
              <div className="space-y-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">1. Check-in Proof</Label>
                        <div className="mt-1 rounded-lg overflow-hidden border-2 border-slate-100 shadow-inner bg-slate-50 aspect-square flex items-center justify-center">
                          {reviewingTask.startProof ? (
                            <img 
                              src={reviewingTask.startProof} 
                              alt="Check-in Proof" 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="text-[10px] text-slate-400">No check-in photo</div>
                          )}
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">2. Completion Proof</Label>
                        <div className="mt-1 rounded-lg overflow-hidden border-2 border-primary/20 shadow-inner bg-slate-50 aspect-square flex items-center justify-center">
                          {reviewingTask.completionProof ? (
                            <img 
                              src={reviewingTask.completionProof} 
                              alt="Completion Proof" 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="text-[10px] text-slate-400">No completion photo</div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <Label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Volunteer Completion Notes</Label>
                      <div className="mt-2 p-4 rounded-xl bg-slate-50 border border-slate-100 text-sm italic text-slate-700 min-h-[80px]">
                        "{reviewingTask.completionNotes || "No notes provided by volunteer."}"
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 space-y-3">
                      <Label className="text-xs text-amber-600 uppercase font-bold tracking-wider flex items-center gap-2">
                        <Users className="w-3 h-3" /> Verify Impact Metrics
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-500">Reach (Beneficiaries)</Label>
                          <Input 
                            type="number" 
                            className="h-8 text-xs" 
                            value={reviewingTask.beneficiaries} 
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setReviewingTask({...reviewingTask, beneficiaries: val});
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-500">Effort (Complexity)</Label>
                          <select 
                            className="w-full h-8 text-xs bg-white border rounded px-2"
                            value={reviewingTask.complexity}
                            onChange={(e) => {
                              setReviewingTask({...reviewingTask, complexity: e.target.value as any});
                            }}
                          >
                            <option value="Simple">Simple</option>
                            <option value="Standard">Standard</option>
                            <option value="Complex">Complex</option>
                          </select>
                        </div>
                      </div>
                      <div className="pt-2 text-center">
                        <p className="text-xs font-bold text-amber-700">
                          Estimated Reward: {10 + (reviewingTask.priority === 'High' ? 40 : reviewingTask.priority === 'Medium' ? 20 : 0) + Math.min(60, (reviewingTask.beneficiaries || 0) * 2) + (reviewingTask.complexity === 'Complex' ? 50 : reviewingTask.complexity === 'Standard' ? 20 : 0)} Points
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 rounded-xl border-2 border-primary/10 bg-primary/5">
                      <Label className="text-xs text-primary uppercase font-bold tracking-wider">Original Task</Label>
                      <h4 className="font-bold text-slate-900 mt-1">{reviewingTask.title}</h4>
                      <p className="text-xs text-slate-600 mt-2 line-clamp-4">{reviewingTask.description}</p>
                      <div className="flex gap-2 mt-4">
                        <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">
                          {reviewingTask.priority} Priority
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold">
                          {reviewingTask.urgency}
                        </span>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label className="text-xs text-red-500 uppercase font-bold tracking-wider">Rejection Reason (If needed)</Label>
                      <Textarea 
                        placeholder="Explain why the proof is insufficient..."
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="text-sm"
                      />
                      <p className="text-[10px] text-slate-400">
                        Rejecting will send the task back to the volunteer's 'In Progress' list.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button 
                variant="outline" 
                onClick={() => setIsReviewDialogOpen(false)}
                disabled={isProcessingApproval}
              >
                Wait for Now
              </Button>
              <div className="flex gap-2">
                <Button 
                  variant="destructive"
                  onClick={() => handleRejectTask(reviewingTask!)}
                  disabled={isProcessingApproval || !rejectionReason.trim()}
                >
                  {isProcessingApproval ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Reject Proof
                </Button>
                <Button 
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => handleApproveTask(reviewingTask!)}
                  disabled={isProcessingApproval}
                >
                  {isProcessingApproval ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Approve & Award Points
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
      <ChatBot tasks={tasks} userRole="ngo" currentTask={reviewingTask} />
    </div>
  );
}
