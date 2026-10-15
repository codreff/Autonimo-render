// @ts-nocheck
// Google Workspace Integration Utilities (Clean, client-side REST calling)
import { getAccessToken } from "./firebase";

// Helper to handle standard Google Rest API Responses
async function googleFetch(url: string, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Token Google OAuth tidak ditemukan. Silakan login kembali.");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Google API Error (${res.status}):`, errText);
    throw new Error(`Google Workspace API Error: ${res.status} - ${errText || res.statusText}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// 1. Google Drive API & Custom Picker Interface
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
}

export async function listDriveFiles(mimeTypeFilter?: string): Promise<DriveFile[]> {
  let queryStr = "trashed = false";
  if (mimeTypeFilter) {
    queryStr += ` and mimeType = '${mimeTypeFilter}'`;
  }
  // List files, requesting ID, name, mimeType, and thumbnail for visual browsing
  const data = await googleFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(queryStr)}&fields=files(id,name,mimeType,thumbnailLink,webViewLink)&pageSize=30`,
  );
  return data.files || [];
}

// 2. Google Docs API
export async function getGoogleDocContent(documentId: string): Promise<string> {
  const data = await googleFetch(`https://www.googleapis.com/v1/documents/${documentId}`);
  let textContent = "";

  if (data.body && data.body.content) {
    data.body.content.forEach((element: any) => {
      if (element.paragraph && element.paragraph.elements) {
        element.paragraph.elements.forEach((paraEl: any) => {
          if (paraEl.textRun && paraEl.textRun.content) {
            textContent += paraEl.textRun.content;
          }
        });
      }
    });
  }
  return textContent;
}

// 3. Google Sheets API
export async function getGoogleSheetValues(
  spreadsheetId: string,
  range: string = "A1:C50",
): Promise<string[][]> {
  const data = await googleFetch(
    `https://www.googleapis.com/sheets/v4/spreadsheets/${spreadsheetId}/values/${range}`,
  );
  return data.values || [];
}

// 4. Google Calendar API (Destructive/Mutating require user warning confirmation beforehand)
export async function createGoogleCalendarEvent(eventData: {
  summary: string;
  description: string;
  startTime: string; // ISO 8601 string
  endTime: string; // ISO 8601 string
}): Promise<any> {
  const confirmed = window.confirm(
    `Apakah Anda yakin ingin menjadwalkan agenda "${eventData.summary}" di Google Calendar Anda?`,
  );
  if (!confirmed) return null;

  const url = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const body = JSON.stringify({
    summary: eventData.summary,
    description: eventData.description,
    start: { dateTime: eventData.startTime, timeZone: "Local" },
    end: { dateTime: eventData.endTime, timeZone: "Local" },
  });

  return googleFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

// 5. Gmail API (Requires user warning confirmation beforehand)
export async function sendGmailMessage(emailData: {
  to: string;
  subject: string;
  body: string;
}): Promise<any> {
  const confirmed = window.confirm(`Kirim email ke ${emailData.to} menggunakan Gmail Anda?`);
  if (!confirmed) return null;

  // Gmail raw API expects standard RFC 822 format in base64url encoding
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(emailData.subject)))}?=`;
  const emailLines = [
    `To: ${emailData.to}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${utf8Subject}`,
    "",
    emailData.body,
  ];
  const emailContent = emailLines.join("\r\n");

  // Safe base64url encoder
  const base64Encoded = btoa(unescape(encodeURIComponent(emailContent)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const url = "https://www.googleapis.com/gmail/v1/users/me/messages/send";
  return googleFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Encoded }),
  });
}

// 6. People API (Contacts API)
export interface WorkspaceContact {
  name: string;
  email: string;
}

export async function fetchGoogleContacts(): Promise<WorkspaceContact[]> {
  const url =
    "https://www.googleapis.com/people/v1/people/me/connections?personFields=names,emailAddresses&pageSize=100";
  const data = await googleFetch(url);
  const contacts: WorkspaceContact[] = [];

  if (data.connections) {
    data.connections.forEach((conn: any) => {
      const name = conn.names?.[0]?.displayName || "Tanpa Nama";
      const email = conn.emailAddresses?.[0]?.value;
      if (email) {
        contacts.push({ name, email });
      }
    });
  }
  return contacts;
}
