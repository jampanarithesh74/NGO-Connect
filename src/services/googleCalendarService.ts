/**
 * Service to handle Google Calendar integration
 */

declare const google: any;

const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events'
].join(' ');

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Gets a valid access token from Google
 */
export const getAccessToken = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Check if we have a valid cached token
    if (cachedToken && Date.now() < tokenExpiry) {
      return resolve(cachedToken);
    }

    try {
      if (typeof google === 'undefined') {
        return reject(new Error('Google Identity Services script not loaded. Check index.html.'));
      }

      if (!CLIENT_ID || CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
        return reject(new Error('Google Client ID is not configured. Please set VITE_CLIENT_ID in your environment.'));
      }

      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.access_token) {
            cachedToken = response.access_token;
            // Token usually expires in 1 hour (3600 seconds)
            // We set expiry to 55 minutes to be safe
            tokenExpiry = Date.now() + (response.expires_in || 3600) * 1000 - (5 * 60 * 1000);
            resolve(response.access_token);
          } else {
            reject(new Error('Failed to get access token: ' + (response.error || 'Unknown error')));
          }
        },
      });
      client.requestAccessToken();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Creates a calendar event for a task
 */
export const createCalendarEvent = async (task: {
  title: string;
  description: string;
  deadline?: any;
  location?: any;
}) => {
  try {
    const accessToken = await getAccessToken();
    
    // Default deadline to 24 hours from now if not provided
    const startTime = task.deadline?.toDate ? task.deadline.toDate() : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour duration

    const event = {
      summary: `Volunteer Task: ${task.title}`,
      location: task.location ? `${task.location.area}, ${task.location.district}, ${task.location.state}` : 'Remote',
      description: task.description,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
    };

    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Calendar API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    throw error;
  }
};
