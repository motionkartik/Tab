import { protectedIds, sessionKeys, PROTECTED_IDS_KEY, setProtectedIds, getWorkspaceGroups, setWorkspaceGroups } from "./workspace-state.js";
import { deriveKey, encryptData, decryptData, randomBase64 } from "../crypto-utils.js";
import { saveWorkspacesToStorage, persistWorkspaceState } from "./workspace-storage.js";
import { GRID_COLS, boardColumnsFromPayload } from "../grid-columns.js";
import { t } from "../i18n.js";
import { getLocal } from "../storage-local.js";
import {
    encryptTodosForProtection,
    decryptTodosForUnprotection,
} from "../todo/todo-storage.js";
import {
    encryptNotesForProtection,
    decryptNotesForUnprotection,
} from "../notes/notes-storage.js";

export function showPassphraseModal(opts = {}) {
  return new Promise(resolve => {
    const overlay = document.getElementById('passphrase-modal');
    const titleEl = document.getElementById('passphrase-modal-title');
    const descEl = document.getElementById('passphrase-modal-desc');
    const inputEl = document.getElementById('passphrase-modal-input');
    const confirmEl = document.getElementById('passphrase-modal-confirm');
    const errorEl = document.getElementById('passphrase-modal-error');
    const okBtn = document.getElementById('passphrase-modal-ok');
    const cancelBtn = document.getElementById('passphrase-modal-cancel');

    if (!overlay) { resolve(null); return; }

    titleEl.textContent = opts.title || t("wp39_default_title");
    descEl.textContent = opts.desc || t("wp39_default_desc");
    okBtn.textContent = opts.confirm ? t("wp39_btn_protect") : t("wp39_btn_unlock");
    inputEl.value = '';
    errorEl.textContent = '';
    confirmEl.style.display = opts.confirm ? '' : 'none';
    confirmEl.value = '';

    overlay.style.display = 'flex';
    setTimeout(() => inputEl.focus(), 50);

    let done = false;
    function finish(value) {
      if (done) return;
      done = true;
      overlay.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('keydown', onKey);
      resolve(value);
    }

    function onOk() {
      const pass = inputEl.value;
      if (!pass) { errorEl.textContent = t("wp39_err_empty"); return; }
      if (pass.length < 4) { errorEl.textContent = t("wp39_err_min_length"); return; }
      if (opts.confirm) {
        if (pass !== confirmEl.value) { errorEl.textContent = t("wp39_err_mismatch"); return; }
      }
      finish(pass);
    }

    function onCancel() { finish(null); }

    function onKey(e) {
      if (e.key === 'Enter') { e.preventDefault(); onOk(); }
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('keydown', onKey);
  });
}

export async function loadProtectedIds() {
  return new Promise(resolve => {
    getLocal([PROTECTED_IDS_KEY], result => {
      setProtectedIds(result[PROTECTED_IDS_KEY] || []);
      resolve();
    });
  });
}

export async function protectWorkspace(workspaceId) {
  const passphrase = await showPassphraseModal({
    title: t("wp39_protect_title"),
    desc: t("wp39_protect_desc", [workspaceId.replace(/-/g, ' ')]),
    confirm: true,
  });
  if (!passphrase) return;

  try {
    const salt = randomBase64(16);
    const key = await deriveKey(passphrase, salt);
    const groups = getWorkspaceGroups(workspaceId);
    const plaintext = JSON.stringify(groups);
    const encrypted = await encryptData(key, plaintext);

    const newProtectedIds = protectedIds.includes(workspaceId) ? protectedIds : [...protectedIds, workspaceId];
    await persistWorkspaceState({
      [`workspace_protected_${workspaceId}`]: { salt, gridColumns: GRID_COLS, ...encrypted },
      [PROTECTED_IDS_KEY]: newProtectedIds,
    });
    setProtectedIds(newProtectedIds);
    sessionKeys.set(workspaceId, key);
    // Notes inherit workspace protection: encrypt this workspace's notes blob
    // with the same session key so it is unreadable while the workspace is
    // locked. Best-effort — never let notes break workspace protection.
    try {
      await encryptNotesForProtection(workspaceId, key);
    } catch (e) {
      console.warn("[notes] encrypt-on-protect failed", e);
    }
    // Global todos inherit workspace protection the same way as notes.
    try {
      await encryptTodosForProtection(workspaceId, key);
    } catch (e) {
      console.warn("[todos] encrypt-on-protect failed", e);
    }
    // Keep the real groups in memory: the workspace is now unlocked for this
    // session (session key present), exactly like after unprotect. The save
    // below encrypts the in-memory groups into the blob and persists [] to the
    // plaintext `workspaces` key. Clearing to [] here instead made the save
    // encrypt an empty board over the ciphertext written moments ago.
    saveWorkspacesToStorage();

    const { renderWorkspaceTabs } = await import("./workspace-tabs-ui.js");
    renderWorkspaceTabs();
  } catch (e) {
    alert(t("wp39_protect_fail", [e.message]));
  }
}

let _unlocking = false;

export async function unprotectWorkspace(workspaceId) {
  if (_unlocking) return;
  _unlocking = true;
  try {
    await _doUnprotect(workspaceId);
  } finally {
    _unlocking = false;
  }
}

async function _doUnprotect(workspaceId) {
  const passphrase = await showPassphraseModal({
    title: t("wp39_unprotect_title"),
    desc: t("wp39_unprotect_desc", [workspaceId.replace(/-/g, ' ')]),
  });
  if (!passphrase) return;

  try {
    const stored = await new Promise(r => getLocal([`workspace_protected_${workspaceId}`], r));
    const meta = stored[`workspace_protected_${workspaceId}`];
    if (!meta) throw new Error('No encrypted data found.');
    const key = await deriveKey(passphrase, meta.salt);
    const plaintext = await decryptData(key, meta.iv, meta.data);
    // 12-column-era blobs (no gridColumns stamp) get their geometry doubled.
    const groups = boardColumnsFromPayload(meta, JSON.parse(plaintext));

    setWorkspaceGroups(workspaceId, groups);
    setProtectedIds(protectedIds.filter(id => id !== workspaceId));
    await persistWorkspaceState(
      { [PROTECTED_IDS_KEY]: protectedIds.filter(id => id !== workspaceId) },
      { removeKeys: [`workspace_protected_${workspaceId}`] },
    );
    // Notes inherit protection: decrypt this workspace's notes blob back to
    // plaintext now that the workspace is no longer protected. Best-effort.
    try {
      await decryptNotesForUnprotection(workspaceId, key);
    } catch (e) {
      console.warn("[notes] decrypt-on-unprotect failed", e);
    }
    // Global todos: decrypt back to plaintext alongside notes.
    try {
      await decryptTodosForUnprotection(workspaceId, key);
    } catch (e) {
      console.warn("[todos] decrypt-on-unprotect failed", e);
    }
    sessionKeys.delete(workspaceId);

    saveWorkspacesToStorage();
    const { renderWorkspaceTabs } = await import("./workspace-tabs-ui.js");
    renderWorkspaceTabs();

    const { currentWorkspace, loadCurrentWorkspace } = await import("./workspace-grid-sync.js");
    if (currentWorkspace === workspaceId) loadCurrentWorkspace();
  } catch (e) {
    alert(t("wp39_decrypt_fail", [e.message]));
  }
}
