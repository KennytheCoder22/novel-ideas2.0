import { router } from "expo-router";

type PendingHomeRestore = {
  reopenHeaderMenu: boolean;
};

const PENDING_HOME_RESTORE_KEY = "novelideas_pending_home_restore_v1";
const VERIFIED_ADMIN_UNLOCK_KEY = "novelideas_verified_admin_unlock_v1";

let pendingHomeRestoreMemory: PendingHomeRestore | null = null;
let verifiedAdminUnlockMemory = false;

function safeSessionStorageGet(key: string): string | null {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage.getItem(key);
  } catch {}
  return null;
}

function safeSessionStorageSet(key: string, value: string): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value);
  } catch {}
}

function safeSessionStorageRemove(key: string): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
  } catch {}
}

export function queuePendingHomeRestore(state: PendingHomeRestore): void {
  pendingHomeRestoreMemory = state;
  safeSessionStorageSet(PENDING_HOME_RESTORE_KEY, JSON.stringify(state));
}

export function consumePendingHomeRestore(): PendingHomeRestore | null {
  const raw =
    pendingHomeRestoreMemory != null
      ? JSON.stringify(pendingHomeRestoreMemory)
      : safeSessionStorageGet(PENDING_HOME_RESTORE_KEY);
  pendingHomeRestoreMemory = null;
  safeSessionStorageRemove(PENDING_HOME_RESTORE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return { reopenHeaderMenu: parsed?.reopenHeaderMenu === true };
  } catch {}
  return null;
}

export function setVerifiedAdminMenuUnlock(unlocked: boolean): void {
  verifiedAdminUnlockMemory = unlocked;
  if (unlocked) safeSessionStorageSet(VERIFIED_ADMIN_UNLOCK_KEY, "1");
  else safeSessionStorageRemove(VERIFIED_ADMIN_UNLOCK_KEY);
}

export function hasVerifiedAdminMenuUnlock(): boolean {
  if (verifiedAdminUnlockMemory) return true;
  verifiedAdminUnlockMemory = safeSessionStorageGet(VERIFIED_ADMIN_UNLOCK_KEY) === "1";
  return verifiedAdminUnlockMemory;
}

export async function returnToNovelIdeas(options: {
  beforeNavigate?: () => boolean | Promise<boolean>;
} = {}): Promise<boolean> {
  const shouldNavigate = (await options.beforeNavigate?.()) ?? true;
  if (!shouldNavigate) return false;
  router.replace("/");
  return true;
}
