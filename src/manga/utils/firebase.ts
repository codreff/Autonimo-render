// @ts-nocheck
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDocFromServer,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Google Auth Provider configured with required Workspace Scopes
export const provider = new GoogleAuthProvider();

export const getWorkspaceProvider = () => {
  const ws = new GoogleAuthProvider();
  ws.addScope("https://www.googleapis.com/auth/documents");
  ws.addScope("https://www.googleapis.com/auth/spreadsheets");
  ws.addScope("https://www.googleapis.com/auth/drive");
  ws.addScope("https://www.googleapis.com/auth/calendar");
  ws.addScope("https://www.googleapis.com/auth/gmail.readonly");
  ws.addScope("https://www.googleapis.com/auth/contacts");
  return ws;
};

// OperationType Enum as mandated
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

// Global Custom Error Handler complying strictly to FirestoreErrorInfo format
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Hardened Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test first connection as mandated by skill
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

// State variables for Auth Token Caching in-memory
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void,
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (
  withWorkspace: boolean = false,
): Promise<{ user: User; accessToken: string | null } | null> => {
  try {
    isSigningIn = true;
    const currentProvider = withWorkspace ? getWorkspaceProvider() : provider;
    const result = await signInWithPopup(auth, currentProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
    } else if (!withWorkspace) {
      cachedAccessToken = null;
    }

    // Register or sync User Profile inside user_profiles collection
    await syncUserProfile(result.user);

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

// Sync registered user details securely inside Firestore user_profiles
async function syncUserProfile(user: User) {
  const profilePath = `user_profiles/${user.uid}`;
  try {
    const profileRef = doc(db, "user_profiles", user.uid);
    await setDoc(
      profileRef,
      {
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "Google User",
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    // Graceful error handle or console report
    console.warn("Sync profile warning:", error);
  }
}

// Manga Storyboard projects Firestore persistence functions
export async function saveMangaProjectToCloud(
  projectId: string,
  name: string,
  globalScript: string,
  panels: any[],
) {
  if (!auth.currentUser) throw new Error("Authentication required to save projects");

  const path = `manga_projects/${projectId}`;
  try {
    const projectRef = doc(db, "manga_projects", projectId);
    // Strict schema fields matching firebase-blueprint
    await setDoc(
      projectRef,
      {
        id: projectId,
        userId: auth.currentUser.uid,
        name: name || "Tanpa Nama",
        globalScript: globalScript || "",
        panelsJson: JSON.stringify(panels),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loadMangaProjectsFromCloud(): Promise<any[]> {
  if (!auth.currentUser) return [];

  const path = "manga_projects";
  try {
    const q = query(collection(db, "manga_projects"), where("userId", "==", auth.currentUser.uid));
    const querySnapshot = await getDocs(q);
    const projects: any[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      projects.push({
        ...data,
        panels: data.panelsJson ? JSON.parse(data.panelsJson) : [],
      });
    });

    // Sort projects in-memory by updatedAt descending
    projects.sort((a, b) => {
      const valA = a.updatedAt;
      const valB = b.updatedAt;
      const timeA =
        valA && typeof valA.toMillis === "function"
          ? valA.toMillis()
          : valA && valA.seconds
            ? valA.seconds * 1000
            : 0;
      const timeB =
        valB && typeof valB.toMillis === "function"
          ? valB.toMillis()
          : valB && valB.seconds
            ? valB.seconds * 1000
            : 0;
      return timeB - timeA;
    });

    return projects;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteMangaProjectFromCloud(projectId: string) {
  if (!auth.currentUser) throw new Error("Authentication required to delete projects");
  const path = `manga_projects/${projectId}`;
  try {
    const projectRef = doc(db, "manga_projects", projectId);
    await deleteDoc(projectRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
