import { doc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import { db } from './firebase';

export const BADGE_CONFIG = [
  { id: 'first_responder', label: 'First Responder', description: 'Completed your first task!' },
  { id: 'high_impact', label: 'High Impact', description: 'Completed 3 High Priority tasks.' },
  { id: 'community_pillar', label: 'Community Pillar', description: 'Completed 10 total tasks.' },
];

export async function awardPointsAndBadges(volunteerId: string, taskPriority: string) {
  console.log(`Awarding points to ${volunteerId} for ${taskPriority} priority task`);
  try {
    const volunteerRef = doc(db, 'users', volunteerId);
    // Use getDocFromServer to ensure we have the absolute latest points before incrementing
    const volunteerSnap = await getDocFromServer(volunteerRef);
    
    if (!volunteerSnap.exists()) {
      console.error(`Volunteer document not found for ID: ${volunteerId}`);
      return;
    }
    
    const volunteerData = volunteerSnap.data();
    const pointsToAdd = taskPriority === 'High' ? 50 : taskPriority === 'Medium' ? 30 : 10;
    const currentPoints = Number(volunteerData.totalPoints || 0);
    const newPoints = currentPoints + pointsToAdd;
    
    console.log(`Current points: ${currentPoints}, Adding: ${pointsToAdd}, New total: ${newPoints}`);
    
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
      totalPoints: newPoints,
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
