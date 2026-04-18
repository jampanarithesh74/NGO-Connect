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
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { awardPointsAndBadges } from '@/src/lib/gamification';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
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

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

type Section = 'home' | 'upload' | 'previous' | 'progress' | 'completed';

interface AnalysisResult {
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  urgency: 'Immediate' | 'Soon' | 'Planned';
}

interface Report {
  id: string;
  content: string;
  analysis: AnalysisResult[];
  status: 'pending' | 'processed';
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
  volunteerId?: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  urgency: 'Immediate' | 'Soon' | 'Planned';
  status: 'pending' | 'accepted' | 'in-progress' | 'completed' | 'cancelled';
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
  const [reportText, setReportText] = useState('');
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
  
  // Editing state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

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

  const handleUpdateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      await updateDoc(doc(db, 'tasks', taskId), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });

      // Award points and badges if completed
      if (newStatus === 'completed' && task.volunteerId) {
        const loadingToast = toast.loading("Awarding volunteer impact points...");
        try {
          const result = await awardPointsAndBadges(task.volunteerId, task.priority);
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
  };

  const handleSaveTaskEdit = async () => {
    if (!editingTask) return;
    try {
      await updateDoc(doc(db, 'tasks', editingTask.id), {
        title: editTitle,
        description: editDescription,
        updatedAt: serverTimestamp()
      });
      toast.success("Task updated successfully");
      setEditingTask(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${editingTask.id}`);
    }
  };

  const handleAnalyze = async () => {
    if (!reportText.trim()) {
      toast.error("Please enter some report data to analyze.");
      return;
    }

    const locationData = {
      lat: selectedLocation?.lat,
      lng: selectedLocation?.lng,
      area: area.trim(),
      landmark: landmark.trim(),
      district: district.trim(),
      state: state.trim()
    };

    // Lenient validation: Either text address OR map pin is enough
    const hasTextAddress = locationData.area && locationData.district && locationData.state;
    const hasMapPin = locationData.lat !== undefined && locationData.lng !== undefined;

    if (!hasTextAddress && !hasMapPin) {
      toast.error("Please provide at least a map pin or address details (Area, District, State).");
      return;
    }

    // Sanitize location data for Firestore (remove undefined values)
    const sanitizedLocation: any = {};
    if (locationData.lat !== undefined) sanitizedLocation.lat = locationData.lat;
    if (locationData.lng !== undefined) sanitizedLocation.lng = locationData.lng;
    if (locationData.area) sanitizedLocation.area = locationData.area;
    if (locationData.landmark) sanitizedLocation.landmark = locationData.landmark;
    if (locationData.district) sanitizedLocation.district = locationData.district;
    if (locationData.state) sanitizedLocation.state = locationData.state;

    setIsAnalyzing(true);
    try {
      const locationContext = `Location Context: Area: ${locationData.area}, Landmark: ${locationData.landmark}, District: ${locationData.district}, State: ${locationData.state}`;

      const prompt = `
        Analyze the following NGO report and extract key action items or tasks. 
        ${locationContext}
        
        For each task, provide:
        1. A concise title.
        2. A brief description (incorporate location context if relevant).
        3. Priority (High, Medium, or Low).
        4. Urgency (Immediate, Soon, or Planned).
        
        Format the output as a JSON array of objects with keys: title, description, priority, urgency.
        
        Report:
        ${reportText}
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      
      const text = response.text || "";
      
      // Clean up the response to ensure it's valid JSON
      const jsonMatch = text.match(/\[.*\]/s);
      if (jsonMatch) {
        const parsedResults = JSON.parse(jsonMatch[0]) as AnalysisResult[];
        setAnalysisResults(parsedResults);
        
        // Save Report
        const reportData: any = {
          ngoId: user?.uid,
          content: reportText,
          analysis: parsedResults,
          status: 'processed',
          createdAt: serverTimestamp(),
          location: sanitizedLocation
        };

        const reportRef = await addDoc(collection(db, 'reports'), reportData);

        // Save individual tasks using a batch
        const batch = writeBatch(db);
        parsedResults.forEach((item) => {
          const taskRef = doc(collection(db, 'tasks'));
          const taskData: any = {
            reportId: reportRef.id,
            ngoId: user?.uid,
            title: item.title,
            description: item.description,
            priority: item.priority,
            urgency: item.urgency,
            status: 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            location: sanitizedLocation
          };

          batch.set(taskRef, taskData);
        });
        await batch.commit();
        
        toast.success("Analysis complete and tasks generated!");
        setReportText(''); // Clear input after success
        setSelectedLocation(null); // Reset location
        setArea('');
        setLandmark('');
        setDistrict('');
        setState('');
      } else {
        throw new Error("Could not parse AI response");
      }
    } catch (error) {
      console.error("Analysis error:", error);
      toast.error("Failed to analyze report. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sidebarItems = [
    { id: 'upload', label: 'Upload Data', icon: Upload },
    { id: 'previous', label: 'Previous Uploads', icon: History },
    { id: 'progress', label: 'In Progress Works', icon: Clock },
    { id: 'completed', label: 'Completed Tasks', icon: CheckCircle2 },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col shadow-sm">
        <div className="p-6">
          <div className="flex items-center gap-2 text-primary mb-8">
            <LayoutDashboard className="w-8 h-8" />
            <span className="font-bold text-xl tracking-tight">NGO Portal</span>
          </div>
          
          <nav className="space-y-1">
            {sidebarItems.map((item) => (
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
      <main className="flex-1 overflow-y-auto p-8">
        <AnimatePresence mode="wait">
          {activeSection === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto text-center mt-20"
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
            </motion.div>
          )}

          {activeSection === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-5xl mx-auto"
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
                    <div className="space-y-2">
                      <Label htmlFor="report">Report Content</Label>
                      <textarea
                        id="report"
                        className="w-full min-h-[300px] p-4 rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="e.g., We visited the rural health center today. There is a critical shortage of clean water and basic medical supplies. Three volunteers are needed for next week's vaccination drive..."
                        value={reportText}
                        onChange={(e) => setReportText(e.target.value)}
                      />
                    </div>
                    <Button 
                      className="w-full py-6 text-lg" 
                      onClick={handleAnalyze}
                      disabled={isAnalyzing || !reportText.trim()}
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
                              <span className="text-[10px] font-medium text-slate-400 uppercase">
                                {result.urgency}
                              </span>
                            </div>
                            <CardTitle className="text-lg">{result.title}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-slate-600 leading-relaxed">
                              {result.description}
                            </p>
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
              className="max-w-5xl mx-auto"
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
                                {report.createdAt?.toDate().toLocaleDateString()} at {report.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </CardDescription>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                              report.status === 'completed' ? 'bg-green-100 text-green-700' : 
                              report.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 
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
                            </div>
                            <CardTitle className="text-lg">{result.title}</CardTitle>
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
              className="max-w-5xl mx-auto"
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
                {tasks.filter(t => t.status === (activeSection === 'progress' ? 'in-progress' : 'completed')).length === 0 ? (
                  <div className="col-span-full py-20 text-center text-slate-400">
                    <p>No tasks found in this section.</p>
                  </div>
                ) : (
                  tasks
                    .filter(t => t.status === (activeSection === 'progress' ? 'in-progress' : 'completed'))
                    .map((task) => (
                      <Card key={task.id} className="border-l-4" 
                        style={{ 
                          borderLeftColor: task.priority === 'High' ? '#ef4444' : task.priority === 'Medium' ? '#f59e0b' : '#10b981' 
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
                                {task.status === 'in-progress' && (
                                  <DropdownMenuItem onClick={() => handleUpdateTaskStatus(task.id, 'completed')}>
                                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                    Mark Completed
                                  </DropdownMenuItem>
                                )}
                                {task.status === 'pending' && (
                                  <DropdownMenuItem onClick={() => handleUpdateTaskStatus(task.id, 'cancelled')} className="text-red-600">
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Cancel Task
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <CardTitle className="text-lg">{task.title}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-slate-600 line-clamp-3">
                            {task.description}
                          </p>
                          {task.volunteerId && (
                            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 bg-slate-50 p-2 rounded">
                              <Users className="w-3 h-3" />
                              Assigned to Volunteer
                            </div>
                          )}
                        </CardContent>
                        <CardFooter className="pt-0 flex justify-between items-center">
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {task.createdAt?.toDate().toLocaleDateString()}
                          </div>
                          {task.status === 'pending' && (
                            <Button size="sm" onClick={() => handleUpdateTaskStatus(task.id, 'in-progress')}>
                              <Play className="w-3 h-3 mr-1" />
                              Start
                            </Button>
                          )}
                        </CardFooter>
                      </Card>
                    ))
                )}
              </div>

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
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditingTask(null)}>Cancel</Button>
                    <Button onClick={handleSaveTaskEdit}>Save Changes</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
