import crypto from "crypto";

export interface CalendarEventInput {
  title: string;
  description: string;
  type: "lesson_reminder" | "assessment_date" | "school_event";
  startDate: string; // ISO string or YYYY-MM-DD
  endDate?: string; // ISO string or YYYY-MM-DD
  timeZone?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
}

// Native RS256 JWT assertion generation for Google Service Account authentication
async function getAccessToken(
  clientEmail: string,
  privateKeyStr: string,
  scopes: string[],
): Promise<string> {
  const cleanKey = privateKeyStr.replace(/\\n/g, "\n");
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const base64Encode = (obj: Record<string, unknown> | object) => {
    return Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  };

  const headerB64 = base64Encode(header);
  const claimB64 = base64Encode(claimSet);
  const signInput = `${headerB64}.${claimB64}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signInput);
  const signature = signer
    .sign(cleanKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${signInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to obtain Google access token: ${text}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// Helper to get authorized API fetch headers
async function getCalendarHeaders(): Promise<HeadersInit> {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL; // Reuses same service credentials or specific ones
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing Google Calendar service credentials (GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY)",
    );
  }

  const token = await getAccessToken(clientEmail, privateKey, [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ]);

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function getCalendarId(): string {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    throw new Error("Missing GOOGLE_CALENDAR_ID environment variable.");
  }
  return calendarId;
}

// 1. Create a reminder or event in Google Calendar
export async function createCalendarEvent(event: CalendarEventInput): Promise<GoogleCalendarEvent> {
  const calendarId = getCalendarId();
  const headers = await getCalendarHeaders();

  const isAllDay = !event.startDate.includes("T") && event.startDate.length === 10;
  const timeZone = event.timeZone || "Asia/Riyadh";

  const body = {
    summary: `[${getEventTypeLabel(event.type)}] ${event.title}`,
    description: event.description,
    start: isAllDay ? { date: event.startDate } : { dateTime: event.startDate, timeZone },
    end: isAllDay
      ? { date: event.endDate || event.startDate }
      : {
          dateTime:
            event.endDate ||
            new Date(new Date(event.startDate).getTime() + 60 * 60 * 1000).toISOString(),
          timeZone,
        },
    colorId: getEventColor(event.type),
  };

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create Calendar event: ${errText}`);
  }

  return (await response.json()) as GoogleCalendarEvent;
}

// 2. List reminders/events from Google Calendar
export async function listCalendarEvents(maxResults = 100): Promise<GoogleCalendarEvent[]> {
  const calendarId = getCalendarId();
  const headers = await getCalendarHeaders();

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?maxResults=${maxResults}&orderBy=startTime&singleEvents=true`,
    {
      method: "GET",
      headers,
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to list Calendar events: ${errText}`);
  }

  const data = (await response.json()) as { items?: GoogleCalendarEvent[] };
  return data.items || [];
}

// 3. Delete event from Google Calendar
export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  const calendarId = getCalendarId();
  const headers = await getCalendarHeaders();

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers,
    },
  );

  if (!response.ok && response.status !== 410 && response.status !== 404) {
    const errText = await response.text();
    throw new Error(`Failed to delete Calendar event: ${errText}`);
  }

  return true;
}

function getEventTypeLabel(type: CalendarEventInput["type"]): string {
  switch (type) {
    case "lesson_reminder":
      return "تذكير درس";
    case "assessment_date":
      return "موعد تقييم";
    case "school_event":
      return "فعالية مدرسية";
    default:
      return "حدث";
  }
}

function getEventColor(type: CalendarEventInput["type"]): string {
  switch (type) {
    case "lesson_reminder":
      return "5"; // Yellow/Banana
    case "assessment_date":
      return "11"; // Red/Tomato
    case "school_event":
      return "9"; // Blueberry/Blue
    default:
      return "1"; // Blue
  }
}
