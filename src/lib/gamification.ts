import { doc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import { db } from './firebase';

export const BADGE_CONFIG = [
  { id: 'first_responder', label: 'First Responder', description: 'Completed your first task!' },
  { id: 'high_impact', label: 'High Impact', description: 'Completed 3 High Priority tasks.' },
  { id: 'community_pillar', label: 'Community Pillar', description: 'Completed 10 total tasks.' },
];

export async function awardPointsAndBadges(volunteerId: string, task: any, isLead: boolean = false) {
  console.log(`Awarding points to ${volunteerId} for task: ${task.title}. Lead: ${isLead}`);
  try {
    const volunteerRef = doc(db, 'users', volunteerId);
    const volunteerSnap = await getDoc(volunteerRef);
    
    if (!volunteerSnap.exists()) {
      console.error(`Volunteer document not found for ID: ${volunteerId}`);
      return;
    }
    
    const volunteerData = volunteerSnap.data();
    
    // Unified Impact Score Formula:
    // 1. Urgency/Priority Base
    const priorityPoints = task.priority === 'High' ? 50 : task.priority === 'Medium' ? 30 : 10;
    
    // 2. Reach Multiple (Beneficiaries * 2, cap 60)
    const reachPoints = Math.min(60, (Number(task.beneficiaries) || 0) * 2);
    
    // 3. Complexity Bonus
    const complexityPoints = task.complexity === 'Complex' ? 50 : task.complexity === 'Standard' ? 20 : 0;
    
    let pointsToAdd = priorityPoints + reachPoints + complexityPoints;

    // 4. Lead Bonus
    if (isLead) {
      pointsToAdd += 50; // Lead bonus
    }
    
    const currentPoints = Number(volunteerData.impactPoints ?? volunteerData.totalPoints ?? 0);
    const newPoints = currentPoints + pointsToAdd;
    
    console.log(`Score Breakdown: Priority(${priorityPoints}) + Reach(${reachPoints}) + Complexity(${complexityPoints}) = ${pointsToAdd}`);
    console.log(`Current points: ${currentPoints}, New total: ${newPoints}`);
    
    // Fetch ALL tasks for this volunteer to count accurately
    const tasksQuery = query(
      collection(db, 'tasks'),
      where('volunteerId', '==', volunteerId)
    );
    const tasksSnap = await getDocs(tasksQuery);
    const completedTasks = tasksSnap.docs
      .map(doc => doc.data())
      .filter(t => t.status === 'completed');
    const completedTasksCount = completedTasks.length;
    
    console.log(`Completed tasks count: ${completedTasksCount}`);
    
    const currentBadges = volunteerData.earnedBadges || [];
    const newBadges = [...currentBadges];
    
    // Badge Logic
    if (completedTasksCount >= 1 && !newBadges.find(b => b.id === 'first_responder')) {
      newBadges.push({ 
        id: 'first_responder', 
        label: 'First Responder', 
        earnedAt: new Date().toISOString() 
      });
    }
    
    if (completedTasksCount >= 10 && !newBadges.find(b => b.id === 'community_pillar')) {
      newBadges.push({ 
        id: 'community_pillar', 
        label: 'Community Pillar', 
        earnedAt: new Date().toISOString() 
      });
    }
    
    const highPriorityCompleted = completedTasks.filter(t => t.priority === 'High').length;
    if (highPriorityCompleted >= 3 && !newBadges.find(b => b.id === 'high_impact')) {
      newBadges.push({ 
        id: 'high_impact', 
        label: 'High Impact', 
        earnedAt: new Date().toISOString() 
      });
    }
    
    await updateDoc(volunteerRef, {
      impactPoints: newPoints,
      totalPoints: newPoints, // Maintain legacy for now
      earnedBadges: newBadges,
      updatedAt: serverTimestamp()
    });
    
    console.log(`Successfully updated volunteer profile with ${newPoints} points and ${newBadges.length} badges`);
    
    return { pointsAdded: pointsToAdd, newBadgesCount: newBadges.length - currentBadges.length };
  } catch (error) {
    console.error("Error awarding points and badges:", error);
    throw error;
  }
}
