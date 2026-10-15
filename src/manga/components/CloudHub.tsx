// @ts-nocheck
import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import {
  Cloud,
  Database,
  FileText,
  FolderOpen,
  Save,
  Share2,
  Calendar,
  Mail,
  Users,
  LogOut,
  Download,
  RefreshCw,
  Clock,
  Briefcase,
  Layers,
  Sparkles,
  CheckCircle,
  Check,
  AlertCircle,
  Trash2,
} from "lucide-react";
import {
  initAuth,
  googleSignIn,
  logout,
  saveMangaProjectToCloud,
  loadMangaProjectsFromCloud,
  deleteMangaProjectFromCloud,
  auth,
} from "../utils/firebase";
import {
  listDriveFiles,
  getGoogleDocContent,
  getGoogleSheetValues,
  createGoogleCalendarEvent,
  sendGmailMessage,
  fetchGoogleContacts,
  DriveFile,
  WorkspaceContact,
} from "../utils/workspace";
import { MangaPanel } from "../types";

interface CloudHubProps {
  panels: MangaPanel[];
  setPanels: React.Dispatch<React.SetStateAction<MangaPanel[]>>;
  globalScript: string;
  onUpdateGlobalScript: (newScript: string) => void;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
}

export const CloudHub: React.FC<CloudHubProps> = ({
  panels,
  setPanels,
  globalScript,
  onUpdateGlobalScript,
  activeId,
  setActiveId,
}) => {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isWorkspaceConnecting, setIsWorkspaceConnecting] = useState(false);
  const [hasWorkspaceAccess, setHasWorkspaceAccess] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "projects" | "drive" | "docs" | "sheets" | "calendar" | "gmail"
  >("projects");

  // Status/Messages
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(
    null,
  );

  // Firestore Projects
  const [cloudProjects, setCloudProjects] = useState<any[]>([]);
  const [currentProjectName, setCurrentProjectName] = useState("Projek Mangaku");
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Drive Picker / Files State
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);

  // Docs import input
  const [selectedDocId, setSelectedDocId] = useState("");
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);

  // Sheets import input
  const [selectedSheetId, setSelectedSheetId] = useState("");
  const [sheetRange, setSheetRange] = useState("A1:B10");
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);

  // Docs list & Sheets list fetched from Drive for easier click selector
  const [filteredDocs, setFilteredDocs] = useState<DriveFile[]>([]);
  const [filteredSheets, setFilteredSheets] = useState<DriveFile[]>([]);

  // Calendar Event inputs
  const [calendarSummary, setCalendarSummary] = useState("Edit Video Recap Manga");
  const [calendarDesc, setCalendarDesc] = useState(
    "Waktunya memproduksi manga hasil Auto Edit Manga!",
  );
  const [calendarDate, setCalendarDate] = useState("");
  const [calendarTimeStart, setCalendarTimeStart] = useState("10:00");
  const [calendarTimeEnd, setCalendarTimeEnd] = useState("11:30");
  const [isSchedulingCalendar, setIsSchedulingCalendar] = useState(false);

  // Gmail sharing inputs
  const [contacts, setContacts] = useState<WorkspaceContact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("Storyboard Manga & Naskah Narasi");
  const [isSendingMail, setIsSendingMail] = useState(false);

  // Flash temporary status reporter
  const flashStatus = (text: string, isError: boolean = false) => {
    setStatusMessage({ text, isError });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4500);
  };

  // Auth initialization
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setHasWorkspaceAccess(!!token);
        loadCloudProjectsSync(currentUser);
      },
      () => {
        setUser(null);
        setHasWorkspaceAccess(false);
      },
    );
    return () => unsubscribe();
  }, []);

  // Fetch contextual Google lists when logged in with workspace access
  useEffect(() => {
    if (user && hasWorkspaceAccess) {
      loadDriveFilesContext();
      loadContactsContext();
    }
  }, [user, hasWorkspaceAccess]);

  // Load cloud projects
  const loadCloudProjectsSync = async (usr?: User) => {
    if (!usr && !auth.currentUser) return;
    setIsLoadingProjects(true);
    try {
      const records = await loadMangaProjectsFromCloud();
      setCloudProjects(records);
    } catch (e: any) {
      console.error(e);
      flashStatus("Gagal memuat daftar project Firestore.", true);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // Sync / Fetch files on Google Drive
  const loadDriveFilesContext = async () => {
    setIsLoadingDrive(true);
    try {
      const files = await listDriveFiles();
      setDriveFiles(files);

      // Categorize docs & sheets for selector shortcuts
      setFilteredDocs(files.filter((f) => f.mimeType === "application/vnd.google-apps.document"));
      setFilteredSheets(
        files.filter((f) => f.mimeType === "application/vnd.google-apps.spreadsheet"),
      );
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingDrive(false);
    }
  };

  // Load user contacts
  const loadContactsContext = async () => {
    setIsLoadingContacts(true);
    try {
      const parsedContacts = await fetchGoogleContacts();
      setContacts(parsedContacts);
    } catch (e) {
      console.warn("Layanan Kontak (People API) mungkin belum dikonfigurasi.", e);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  // Authenticate triggers
  const handleLogin = async (withWorkspace: boolean = false) => {
    if (withWorkspace) {
      setIsWorkspaceConnecting(true);
    } else {
      setIsLoggingIn(true);
    }
    try {
      const result = await googleSignIn(withWorkspace);
      if (result) {
        setUser(result.user);
        setHasWorkspaceAccess(!!result.accessToken);
        flashStatus(
          withWorkspace
            ? `Halo ${result.user.displayName}! Login Google Workspace Berhasil.`
            : `Halo ${result.user.displayName}! Login Google (Izin Dasar) Berhasil.`,
        );
        loadCloudProjectsSync(result.user);
      }
    } catch (e: any) {
      console.error(e);
      const isCancelled =
        e.code?.includes("user-cancelled") ||
        e.message?.includes("cancelled") ||
        e.message?.includes("denied");
      if (isCancelled) {
        flashStatus(
          withWorkspace
            ? "Izin Google Workspace dibatalkan atau ditolak. Anda tetap dapat menyimpan proyek dasar."
            : "Login dibatalkan oleh pengguna.",
          true,
        );
      } else {
        flashStatus(`Autentikasi gagal: ${e.message || "Silakan coba lagi."}`, true);
      }
    } finally {
      setIsLoggingIn(false);
      setIsWorkspaceConnecting(false);
    }
  };

  // Sign out
  const handleLogout = async () => {
    if (window.confirm("Keluar dari Akun Google & Hub Awan?")) {
      try {
        await logout();
        setUser(null);
        setCloudProjects([]);
        setDriveFiles([]);
        setFilteredDocs([]);
        setFilteredSheets([]);
        setContacts([]);
        flashStatus("Berhasil keluar dari sesi awan.");
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Firestore Project Saves
  const handleSaveProject = async () => {
    if (!user) return;
    if (panels.length === 0) {
      flashStatus("Tidak dapat menyimpan storyboard kosong.", true);
      return;
    }
    const id = `project-${user.uid.slice(0, 5)}-${Date.now()}`;
    try {
      await saveMangaProjectToCloud(id, currentProjectName, globalScript, panels);
      flashStatus(`Sukses menyimpan storyboard "${currentProjectName}" ke Firestore!`);
      loadCloudProjectsSync();
    } catch (e: any) {
      flashStatus("Gagal menyimpan project.", true);
    }
  };

  // Firestore Project Loads
  const handleLoadProject = (proj: any) => {
    if (window.confirm(`Ganti storyboard aktif dengan "${proj.name}"?`)) {
      setPanels(proj.panels || []);
      onUpdateGlobalScript(proj.globalScript || "");
      setCurrentProjectName(proj.name);
      if (proj.panels?.length > 0) {
        setActiveId(proj.panels[0].id);
      }
      flashStatus(`Berhasil memuat project "${proj.name}" dari cloud!`);
    }
  };

  // Firestore Project Delete
  const handleDeleteCloudProject = async (projectId: string, name: string) => {
    if (
      window.confirm(`Apakah Anda yakin ingin menghapus "${name}" secara permanen dari Firestore?`)
    ) {
      try {
        await deleteMangaProjectFromCloud(projectId);
        flashStatus(`Project "${name}" dihapus.`);
        loadCloudProjectsSync();
      } catch (e) {
        flashStatus("Gagal menghapus project.", true);
      }
    }
  };

  // Doc import execution
  const handleImportDoc = async () => {
    if (!selectedDocId) {
      flashStatus("Silakan masukkan ID Dokumen Google terlebih dahulu.", true);
      return;
    }
    setIsLoadingDoc(true);
    try {
      const text = await getGoogleDocContent(selectedDocId);
      if (!text.trim()) {
        flashStatus("Dokumen ini kosong atau tidak memiliki naskah teks.", true);
      } else {
        onUpdateGlobalScript(text);
        flashStatus("Berhasil mengimpor seluruh naskah narasi dari Google Docs!");
      }
    } catch (e: any) {
      flashStatus("Gagal mengimpor dari Google Docs. Periksa ID dokumen.", true);
    } finally {
      setIsLoadingDoc(false);
    }
  };

  // Sheet import execution
  const handleImportSheet = async () => {
    if (!selectedSheetId) {
      flashStatus("Silakan pilih Spreadsheet terlebih dahulu.", true);
      return;
    }
    setIsLoadingSheet(true);
    try {
      const values = await getGoogleSheetValues(selectedSheetId, sheetRange);
      if (values.length === 0) {
        flashStatus("Baris Spreadsheet terpilih kosong.", true);
        return;
      }

      // Convert rows [Subtitle, Duration, FocusGuide, MotionStyle] into Panels
      const importedPanels: MangaPanel[] = values.map((row, index) => {
        const subtitle = row[0] || `Sub #${index + 1}`;
        const duration = parseFloat(row[1]) || 4.5;
        const focusGuide = row[2] || "fokus";
        const motionType = (row[3] as any) || "65-random";

        return {
          id: `panel-sheet-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`,
          name: `Dialog Impor #${index + 1}`,
          url: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=60", // Stylish default anime template placeholder image
          duration,
          motionType,
          subtitle,
          focusGuide,
        };
      });

      setPanels(importedPanels);
      if (importedPanels.length > 0) {
        setActiveId(importedPanels[0].id);
      }
      flashStatus(`Sukses mengimpor ${importedPanels.length} dialog panel dari Google Sheets!`);
    } catch (e: any) {
      flashStatus("Gagal membaca sel dari Google Sheets.", true);
    } finally {
      setIsLoadingSheet(false);
    }
  };

  // Calendar Event dispatch
  const handleCreateCalendar = async () => {
    if (!calendarDate) {
      flashStatus("Silakan pilih tanggal acara.", true);
      return;
    }
    setIsSchedulingCalendar(true);
    try {
      const startTimeISO = `${calendarDate}T${calendarTimeStart}:00`;
      const endTimeISO = `${calendarDate}T${calendarTimeEnd}:00`;

      const result = await createGoogleCalendarEvent({
        summary: calendarSummary,
        description: `${calendarDesc}\nTotal Panels: ${panels.length} slide.\nScript text: \n"${globalScript.slice(0, 150)}..."`,
        startTime: startTimeISO,
        endTime: endTimeISO,
      });

      if (result) {
        flashStatus(`Berhasil menjadwalkan agenda di Google Calendar!`);
      }
    } catch (e: any) {
      flashStatus("Gagal menjadwalkan agenda.", true);
    } finally {
      setIsSchedulingCalendar(false);
    }
  };

  // Custom visual Drive picker image select
  const handleSelectDriveImage = (file: DriveFile) => {
    if (window.confirm(`Tambahkan gambar "${file.name}" dari Drive sebagai panel baru?`)) {
      const thumbnailHighRes = file.thumbnailLink
        ? file.thumbnailLink.replace(/=s\d+/, "=s1000")
        : "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=60";

      const newPanel: MangaPanel = {
        id: `panel-drive-${Date.now()}-${Math.floor(Math.random() * 999)}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        url: thumbnailHighRes,
        duration: 4.5,
        motionType: "65-random",
        subtitle: `Panel diimpor dari Google Drive`,
        focusGuide: "fokus",
      };

      setPanels((prev) => [...prev, newPanel]);
      setActiveId(newPanel.id);
      flashStatus(`Berhasil memuat gambar dari Drive!`);
    }
  };

  // Gmail send dispatch
  const handleSendGmail = async () => {
    if (!emailTo) {
      flashStatus("Silakan masukkan alamat email penerima.", true);
      return;
    }
    setIsSendingMail(true);
    try {
      // Compose a highly professional report summary body
      const summaryHTML = `
        <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #1e293b; border-radius: 8px; background-color: #0c0a09; color: #f5f5f4;">
          <h2 style="color: #22d3ee; border-bottom: 2px solid #22d3ee; padding-bottom: 8px; text-transform: uppercase;">Manga Storyboard Digest</h2>
          <p style="color: #a8a29e;">Laporan ringkasan storyboard ini diproduksi langsung melalui studio <strong>Auto Edit Manga</strong> menggunakan real-time cloud data sync.</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr style="background-color: #1c1917; color: #e7e5e4;">
              <th style="padding: 10px; border: 1px solid #292524; text-align: left;">Project</th>
              <td style="padding: 10px; border: 1px solid #292524;">${currentProjectName}</td>
            </tr>
            <tr>
              <th style="padding: 10px; border: 1px solid #292524; text-align: left;">Total Panel</th>
              <td style="padding: 10px; border: 1px solid #292524;">${panels.length} Frame</td>
            </tr>
            <tr style="background-color: #1c1917; color: #e7e5e4;">
              <th style="padding: 10px; border: 1px solid #292524; text-align: left;">Total Durasi</th>
              <td style="padding: 10px; border: 1px solid #292524;">${panels.reduce((acc, p) => acc + p.duration, 0).toFixed(1)} detik</td>
            </tr>
          </table>

          <h3 style="color: #22d3ee; margin-top: 20px;">Naskah Suara Narasi (Global)</h3>
          <div style="background-color: #1c1917; padding: 12px; border-radius: 4px; border-left: 3px solid #06b6d4; font-style: italic; font-size: 14px; margin-bottom: 15px;">
            "${globalScript.replace(/\n/g, "<br/>")}"
          </div>

          <h3 style="color: #22d3ee;">Detail Panel Storyboard</h3>
          <ol style="padding-left: 20px; color: #e7e5e4;">
            ${panels
              .map(
                (p, idx) => `
              <li style="margin-bottom: 12px;">
                <strong>${p.name}</strong> (${p.duration} detik) - Motion: <em>${p.motionType}</em><br/>
                <span style="color: #a8a29e; font-size: 13px;">Subtitle: "${p.subtitle || "Hening"}"</span>
              </li>
            `,
              )
              .join("")}
          </ol>
          <hr style="border: 0; border-top: 1px dashed #292524; margin: 20px 0;" />
          <p style="font-size: 11px; text-align: center; color: #78716c;">Auto Edit Manga Studio © 2026</p>
        </div>
      `;

      const result = await sendGmailMessage({
        to: emailTo,
        subject: `${emailSubject} - [${currentProjectName}]`,
        body: summaryHTML,
      });

      if (result) {
        flashStatus("Sukses mengirimkan ringkasan storyboard melalui Gmail!");
      }
    } catch (e) {
      flashStatus("Gagal mengirim email.", true);
    } finally {
      setIsSendingMail(false);
    }
  };

  // Render Login Panel if authentication not loaded
  if (!user) {
    return (
      <div
        className="flex flex-col h-full bg-stone-950 border-r border-cyan-500/10 text-stone-300 w-full lg:w-[380px]"
        id="cloud-hub-unauth"
      >
        <div className="p-5 border-b border-cyan-500/10">
          <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase flex items-center gap-2 neon-glow-cyan">
            <Cloud className="w-4 h-4 text-cyan-400" />
            Integrasi Awan Google
          </h2>
          <p className="text-[10px] text-stone-500 mt-1">
            Gunakan akun Google untuk sinkronisasi Workspace dan Firebase
          </p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6">
          <div className="p-4 bg-cyan-950/20 border border-cyan-500/20 rounded-full animate-pulse">
            <Database className="w-12 h-12 text-cyan-400" />
          </div>

          <div className="space-y-2 max-w-xs">
            <h3 className="text-sm font-semibold text-stone-200">Ayo Hubungkan Projectmu!</h3>
            <p className="text-xs text-stone-500 leading-relaxed">
              Dengan masuk menggunakan akun Google Anda, Anda dapat mengaktifkan **Firestore**
              (Simpan/buka storyboard) dan **Google Workspace** (impor naskah/spreadsheet, jadwal
              agenda, kirim Gmail).
            </p>
          </div>

          {/* Strict Official style Google Auth Sign-in Button */}
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="gsi-material-button w-full max-w-xs shadow-md shadow-cyan-950/30 border border-stone-800 rounded-lg py-1 px-3 bg-white hover:bg-stone-55 transition-colors cursor-pointer"
            id="cloud-signin-btn"
          >
            <div className="gsi-material-button-state"></div>
            <div className="gsi-material-button-content-wrapper flex items-center justify-center gap-3">
              <div className="gsi-material-button-icon h-5 w-5">
                <svg
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  style={{ display: "block" }}
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  ></path>
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  ></path>
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  ></path>
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  ></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
              </div>
              <span className="gsi-material-button-contents font-semibold text-stone-900 text-xs">
                {isLoggingIn ? "Menghubungkan..." : "Masuk dengan Google"}
              </span>
            </div>
          </button>
        </div>

        {statusMessage && (
          <div
            className={`m-4 p-3 rounded text-xs border ${statusMessage.isError ? "bg-red-950/20 border-red-500/30 text-red-400" : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"} flex items-center gap-1.5 animate-bounce`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>
    );
  }

  // Loaded/Authenticated Cloud Hub Sidebar Layout
  return (
    <div
      className="flex flex-col h-full bg-stone-950 border-r border-cyan-500/10 text-stone-300 w-full lg:w-[380px] flex-shrink-0"
      id="cloud-hub-root"
    >
      {/* Visual Header with user identity display */}
      <div className="p-4 border-b border-cyan-500/10 flex items-center justify-between bg-stone-900/10">
        <div className="flex items-center gap-2.5">
          {user.photoURL ? (
            <img
              referrerPolicy="no-referrer"
              src={user.photoURL}
              alt={user.displayName || ""}
              className="w-8 h-8 rounded-full border border-cyan-500/30 shadow-[0_0_8px_rgba(6,182,212,0.2)]"
            />
          ) : (
            <div className="w-8 h-8 bg-cyan-500/20 text-cyan-400 rounded-full flex items-center justify-center font-bold text-xs border border-cyan-500/30">
              {user.displayName?.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-stone-200 truncate leading-tight">
              {user.displayName}
            </h3>
            <span className="text-[9px] text-emerald-400 font-medium tracking-normal flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
              Metrik Cloud Aktif
            </span>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="p-1.5 bg-stone-900/60 hover:bg-stone-900 text-stone-500 hover:text-red-400 rounded border border-stone-850 transition-colors cursor-pointer"
          title="Keluar Akun"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Cloud Service Selection Row */}
      <div
        className="flex bg-stone-950 border-b border-cyan-500/10 p-1 overflow-x-auto gap-1 scrollbar-none"
        id="cloud-subservices-tabs"
      >
        <button
          onClick={() => setActiveTab("projects")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
            activeTab === "projects"
              ? "bg-cyan-500 text-stone-950 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
              : "text-stone-500 hover:text-stone-300"
          }`}
          title="Sinkronisasi Projek Firestore"
        >
          <Database className="w-3 h-3" />
          Projek
        </button>
        <button
          onClick={() => setActiveTab("drive")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
            activeTab === "drive"
              ? "bg-cyan-500 text-stone-950 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
              : "text-stone-500 hover:text-stone-300"
          }`}
          title="Custom Drive File Picker"
        >
          <FolderOpen className="w-3 h-3" />
          Drive
        </button>
        <button
          onClick={() => setActiveTab("docs")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
            activeTab === "docs"
              ? "bg-cyan-500 text-stone-950 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
              : "text-stone-500 hover:text-stone-300"
          }`}
          title="Impor Naskah Google Docs"
        >
          <FileText className="w-3 h-3" />
          Docs
        </button>
        <button
          onClick={() => setActiveTab("sheets")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
            activeTab === "sheets"
              ? "bg-cyan-500 text-stone-950 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
              : "text-stone-500 hover:text-stone-300"
          }`}
          title="Impor Google Sheets"
        >
          <Layers className="w-3 h-3" />
          Sheets
        </button>
        <button
          onClick={() => setActiveTab("calendar")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
            activeTab === "calendar"
              ? "bg-cyan-500 text-stone-950 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
              : "text-stone-500 hover:text-stone-300"
          }`}
          title="Agenda Google Calendar"
        >
          <Calendar className="w-3 h-3" />
          Calendar
        </button>
        <button
          onClick={() => setActiveTab("gmail")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
            activeTab === "gmail"
              ? "bg-cyan-500 text-stone-950 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
              : "text-stone-500 hover:text-stone-300"
          }`}
          title="Berbagi Storyboard Gmail"
        >
          <Mail className="w-3 h-3" />
          Gmail
        </button>
      </div>

      {/* Primary Tab Viewport */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" id="cloud-subservices-viewports">
        {activeTab !== "projects" && !hasWorkspaceAccess ? (
          <div
            className="flex flex-col items-center justify-center p-6 text-center space-y-4 border border-dashed border-cyan-500/15 rounded-lg bg-stone-900/15"
            id="workspace-guard-prompt"
          >
            <div className="p-3 bg-cyan-950/20 border border-cyan-500/20 rounded-full">
              <Cloud className="w-8 h-8 text-cyan-400" />
            </div>
            <div className="space-y-1.5 max-w-xs">
              <h3 className="text-xs font-bold text-stone-200 block">
                Akses Google Workspace Dibutuhkan
              </h3>
              <p className="text-[10px] text-stone-500 leading-relaxed block">
                Tab ini menggunakan integrasi Google Workspace API (Docs, Sheets, Drive, Kalender,
                Gmail). Silakan hubungkan akun Google Anda dan berikan izin agar aplikasi dapat
                menyambungkan data secara langsung.
              </p>
            </div>
            <button
              onClick={() => handleLogin(true)}
              disabled={isWorkspaceConnecting}
              className="py-1.5 px-4 bg-cyan-500 text-stone-950 hover:bg-cyan-400 text-xs font-bold rounded transition-all cursor-pointer shadow-[0_0_8px_rgba(6,182,212,0.2)] flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              {isWorkspaceConnecting ? "Menghubungkan..." : "Hubungkan Google Workspace"}
            </button>
          </div>
        ) : (
          <>
            {/* TAB 1: FIRESTORE PROJECTS */}
            {activeTab === "projects" && (
              <div className="space-y-4" id="subservice-projects-panel">
                <div className="p-3 bg-stone-900/30 border border-cyan-500/10 rounded-lg space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                    Simpan Projek Aktif (Cloud Save)
                  </span>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-stone-500 block">
                      Nama Storyboard Project
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={currentProjectName}
                        onChange={(e) => setCurrentProjectName(e.target.value)}
                        className="flex-1 text-xs p-2 bg-stone-950 border border-stone-850 rounded text-stone-100 placeholder-stone-750 focus:outline-none focus:border-cyan-500/40"
                        placeholder="Nama Projek Baru..."
                      />
                      <button
                        onClick={handleSaveProject}
                        className="flex items-center gap-1.5 px-3 py-2 bg-cyan-500 text-stone-950 font-bold hover:bg-cyan-400 text-xs rounded transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Simpan
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      Daftar Projek di Cloud ({cloudProjects.length})
                    </span>
                    <button
                      onClick={() => loadCloudProjectsSync()}
                      className="p-1 hover:text-cyan-400 transition-colors"
                      title="Segarkan data cloud"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${isLoadingProjects ? "animate-spin text-cyan-400" : ""}`}
                      />
                    </button>
                  </div>

                  {isLoadingProjects ? (
                    <div className="py-12 text-center text-xs text-stone-551">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto text-cyan-500 mb-2" />
                      Mengontak Firestore...
                    </div>
                  ) : cloudProjects.length === 0 ? (
                    <div className="text-center py-10 border border-dashed border-stone-900 rounded bg-stone-950/20 text-stone-600 text-[11px]">
                      <Database className="w-6 h-6 mx-auto mb-2 text-stone-800" />
                      Belum ada projek storyboard tersimpan di Firebase cloud.
                      <br />
                      Masukkan nama di atas dan klik Simpan!
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                      {cloudProjects.map((proj) => (
                        <div
                          key={proj.id}
                          className="p-2 border border-stone-900/60 bg-stone-900/10 rounded flex items-center justify-between hover:border-cyan-500/20 hover:bg-stone-900/20 transition-all text-left group"
                        >
                          <div
                            className="min-w-0 flex-1 cursor-pointer pr-3"
                            onClick={() => handleLoadProject(proj)}
                          >
                            <h4 className="text-xs font-semibold text-stone-200 truncate leading-tight">
                              {proj.name}
                            </h4>
                            <span className="text-[9px] text-stone-500 font-mono flex items-center gap-1 mt-1">
                              <Clock className="w-2.5 h-2.5" />
                              {proj.panels?.length || 0} slide,{" "}
                              {(proj.panels || [])
                                .reduce((acc: any, p: any) => acc + p.duration, 0)
                                .toFixed(0)}
                              s total
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteCloudProject(proj.id, proj.name)}
                            className="p-1.5 text-red-500/60 hover:text-red-400 hover:bg-red-500/10 rounded opacity-30 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
                            title="Hapus projek dari Cloud"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: GOOGLE DRIVE CUSTOM IMAGES PICKER */}
            {activeTab === "drive" && (
              <div className="space-y-3" id="subservice-drive-panel">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                      Drive Custom Picker
                    </span>
                    <p className="text-[9.5px] text-stone-500 mt-0.5">
                      Pilih/impor berkas gambar langsung dari Google Drive Anda
                    </p>
                  </div>
                  <button
                    onClick={loadDriveFilesContext}
                    className="p-1 hover:text-cyan-400 transition-colors"
                    title="Refresh Drive files"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isLoadingDrive ? "animate-spin text-cyan-400" : ""}`}
                    />
                  </button>
                </div>

                {isLoadingDrive ? (
                  <div className="py-14 text-center text-xs text-stone-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-500 mb-2" />
                    Membuka Google Drive...
                  </div>
                ) : driveFiles.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-stone-900 rounded bg-stone-950/20 text-stone-600 text-xs">
                    Tidak ada berkas yang dapat dibaca di Google Drive, atau silakan unggah gambar
                    di folder Drive Anda terlebih dahulu.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {driveFiles.map((file) => {
                      const isImage = file.mimeType.startsWith("image/");
                      return (
                        <div
                          key={file.id}
                          onClick={() =>
                            isImage
                              ? handleSelectDriveImage(file)
                              : flashStatus(
                                  `Berkas mimetipe "${file.mimeType}" tidak didukung sebagai Gambar Panel.`,
                                  true,
                                )
                          }
                          className={`p-2 border border-stone-900 bg-stone-900/10 rounded flex flex-col justify-between hover:border-cyan-500/20 hover:bg-stone-900/20 cursor-pointer text-left transition-all relative ${!isImage ? "opacity-40" : ""}`}
                        >
                          {isImage && file.thumbnailLink ? (
                            <div className="w-full h-18 rounded overflow-hidden bg-stone-950 border border-stone-850/60 mb-1.5 flex items-center justify-center">
                              <img
                                referrerPolicy="no-referrer"
                                src={file.thumbnailLink}
                                alt={file.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-full h-18 rounded bg-stone-950 border border-stone-900 flex items-center justify-center mb-1.5 text-stone-600">
                              <FolderOpen className="w-6 h-6 text-stone-700" />
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold text-stone-200 truncate leading-snug">
                              {file.name}
                            </p>
                            <span className="text-[8px] text-stone-500 block truncate font-mono">
                              {isImage ? "Image file" : file.mimeType.split("/")[1] || "Dokumen"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: GOOGLE DOCS (SCRIPT IMPORT) */}
            {activeTab === "docs" && (
              <div className="space-y-4" id="subservice-docs-panel">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                  Impor Naskah Google Docs
                </span>

                <div className="p-3 bg-stone-900/30 border border-cyan-500/10 rounded-lg space-y-3 text-left">
                  <p className="text-[10.5px] text-stone-400 leading-normal">
                    Mengimpor naskah pembacaan teks utuh langsung dari Google Docs. Kalimat-selaras
                    akan dibongkar menjadi pembentuk naskah panel.
                  </p>

                  {filteredDocs.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-[9px] text-stone-500 uppercase font-black">
                        Pilihan Cepat dari Drive Anda:
                      </label>
                      <select
                        onChange={(e) => setSelectedDocId(e.target.value)}
                        value={selectedDocId}
                        className="w-full text-xs p-1.5 bg-stone-950 border border-stone-850 rounded text-stone-200 cursor-pointer"
                      >
                        <option value="">-- Pilih Dokumen --</option>
                        {filteredDocs.map((doc) => (
                          <option key={doc.id} value={doc.id}>
                            {doc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[9px] text-stone-500 uppercase font-black">
                      Atau Tempel ID Google Doc Manual
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={selectedDocId}
                        onChange={(e) => setSelectedDocId(e.target.value)}
                        className="flex-1 text-xs p-1.5 bg-stone-950 border border-stone-850 rounded text-stone-100 placeholder-stone-750 font-mono"
                        placeholder="Contoh: 1h9_PzNIsB..."
                      />
                      <button
                        onClick={handleImportDoc}
                        disabled={isLoadingDoc}
                        className="px-3.5 py-1.5 bg-cyan-500 text-stone-950 font-bold hover:bg-cyan-400 text-xs rounded transition-all cursor-pointer shadow-[0_0_8px_rgba(6,182,212,0.25)] flex items-center justify-center min-w-[70px]"
                      >
                        {isLoadingDoc ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "Impor"
                        )}
                      </button>
                    </div>
                    <span className="text-[8px] text-stone-600 block leading-tight">
                      ID dokumen bisa diambil dari URL Google Docs Anda. Contoh:
                      docs.google.com/document/d/
                      <strong className="text-cyan-400/70">ID_DOKUMEN</strong>/edit
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: GOOGLE SHEETS (CELLS TO STORYBOARD) */}
            {activeTab === "sheets" && (
              <div className="space-y-4" id="subservice-sheets-panel">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                  Impor dari Google Sheets
                </span>

                <div className="p-3 bg-stone-900/30 border border-cyan-500/10 rounded-lg space-y-3 text-left">
                  <p className="text-[10px] text-stone-400 leading-relaxed">
                    Petakan data baris spreadsheet Google Sheets menjadi antrean panel storyboard!
                    Susun format sel spreadsheet Anda: <br />
                    <strong className="text-cyan-400">
                      Kolom A: Subtitle | Kolom B: Durasi (Detik) | Kolom C: Fokus | Kolom D:
                      Gerakan
                    </strong>
                  </p>

                  {filteredSheets.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-[9px] text-stone-400 uppercase font-bold">
                        Pilihan Cepat dari Drive Anda:
                      </label>
                      <select
                        onChange={(e) => setSelectedSheetId(e.target.value)}
                        value={selectedSheetId}
                        className="w-full text-xs p-1.5 bg-stone-950 border border-stone-850 rounded text-stone-200 cursor-pointer"
                      >
                        <option value="">-- Pilih Spreadsheet --</option>
                        {filteredSheets.map((sh) => (
                          <option key={sh.id} value={sh.id}>
                            {sh.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[8.5px] text-stone-500 uppercase font-black block">
                        ID Spreadsheet
                      </label>
                      <input
                        type="text"
                        value={selectedSheetId}
                        onChange={(e) => setSelectedSheetId(e.target.value)}
                        className="w-full text-xs p-1.5 bg-stone-950 border border-stone-850 rounded text-stone-100 placeholder-stone-750 font-mono"
                        placeholder="ID Spreadsheet..."
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8.5px] text-stone-500 uppercase font-black block">
                        Range Sel
                      </label>
                      <input
                        type="text"
                        value={sheetRange}
                        onChange={(e) => setSheetRange(e.target.value)}
                        className="w-full text-xs p-1.5 bg-stone-950 border border-stone-850 rounded text-stone-100 font-mono"
                        placeholder="Contoh: Sheet1!A1:D15"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleImportSheet}
                    disabled={isLoadingSheet}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-cyan-500 hover:bg-cyan-400 text-stone-950 font-bold text-xs rounded transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                  >
                    {isLoadingSheet ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Urai & Impor Baris Spreadsheet"
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 5: GOOGLE CALENDAR ACARA */}
            {activeTab === "calendar" && (
              <div className="space-y-4" id="subservice-calendar-panel">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                  Jadwalkan di Google Calendar
                </span>

                <div className="p-3 bg-stone-900/30 border border-cyan-500/10 rounded-lg space-y-3 text-left">
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-stone-400 uppercase font-semibold">
                      Judul Kegiatan
                    </label>
                    <input
                      type="text"
                      value={calendarSummary}
                      onChange={(e) => setCalendarSummary(e.target.value)}
                      className="w-full text-xs p-2 bg-stone-950 border border-stone-850 rounded text-stone-100 focus:outline-none focus:border-cyan-500/40"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] text-stone-400 uppercase font-semibold">
                      Catatan Keterangan
                    </label>
                    <textarea
                      value={calendarDesc}
                      onChange={(e) => setCalendarDesc(e.target.value)}
                      className="w-full text-xs p-2 bg-stone-950 border border-stone-850 rounded text-stone-100 focus:outline-none focus:border-cyan-500/40"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] text-stone-400 uppercase font-semibold">
                      Pilih Tanggal Agenda
                    </label>
                    <input
                      type="date"
                      value={calendarDate}
                      onChange={(e) => setCalendarDate(e.target.value)}
                      className="w-full text-xs p-2 bg-stone-950 border border-stone-850 rounded text-stone-200 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[8.5px] text-stone-500 uppercase font-black block">
                        Jam Mulai
                      </label>
                      <input
                        type="time"
                        value={calendarTimeStart}
                        onChange={(e) => setCalendarTimeStart(e.target.value)}
                        className="w-full text-xs p-2 bg-stone-950 border border-stone-850 rounded text-stone-200"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8.5px] text-stone-500 uppercase font-black block">
                        Jam Selesai
                      </label>
                      <input
                        type="time"
                        value={calendarTimeEnd}
                        onChange={(e) => setCalendarTimeEnd(e.target.value)}
                        className="w-full text-xs p-2 bg-stone-950 border border-stone-850 rounded text-stone-200"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleCreateCalendar}
                    disabled={isSchedulingCalendar}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-cyan-500 hover:bg-cyan-400 text-stone-950 font-bold text-xs rounded transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {isSchedulingCalendar ? "Menjadwalkan..." : "Tambahkan ke Kalender"}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 6: GMAIL STORYBOARD SHARING */}
            {activeTab === "gmail" && (
              <div className="space-y-4" id="subservice-gmail-panel">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                  Bagikan Laporan via Gmail
                </span>

                <div className="p-3 bg-stone-900/30 border border-cyan-500/10 rounded-lg space-y-3 text-left">
                  {/* Google Contacts Quick Selector Integration */}
                  {contacts.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-[9px] text-stone-400 uppercase font-bold">
                        Pilihan Kontak Cepat (People Connections):
                      </label>
                      <select
                        onChange={(e) => setEmailTo(e.target.value)}
                        value={emailTo}
                        className="w-full text-xs p-1.5 bg-stone-950 border border-stone-850 rounded text-stone-200 cursor-pointer"
                      >
                        <option value="">-- Pilih Email Kontak --</option>
                        {contacts.map((contact, i) => (
                          <option key={i} value={contact.email}>
                            {contact.name} - ({contact.email})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[9px] text-stone-400 uppercase font-semibold block">
                      Email Penerima
                    </label>
                    <input
                      type="email"
                      value={emailTo}
                      onChange={(e) => setEmailTo(e.target.value)}
                      className="w-full text-xs p-2 bg-stone-950 border border-stone-850 rounded text-stone-100 placeholder-stone-700"
                      placeholder="rekan_kerja@gmail.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] text-stone-400 uppercase font-semibold block">
                      Subject Email
                    </label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full text-xs p-2 bg-stone-950 border border-stone-850 rounded text-stone-100"
                    />
                  </div>

                  <button
                    onClick={handleSendGmail}
                    disabled={isSendingMail}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-cyan-500 hover:bg-cyan-400 text-stone-950 font-bold text-xs rounded transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {isSendingMail ? "Mengirim surel..." : "Kirim Ringkasan Storyboard"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Global Status/Message Banner inside workspace sidebar */}
      {statusMessage && (
        <div
          className={`m-4 p-3 rounded text-xs border ${statusMessage.isError ? "bg-red-950/20 border-red-500/30 text-red-400" : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"} flex items-center gap-1.5 shrink-0 animate-pulse`}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="truncate">{statusMessage.text}</span>
        </div>
      )}
    </div>
  );
};
