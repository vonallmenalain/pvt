import { auth } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const trigger = document.getElementById("auth-trigger");
const triggerIconPath = document.getElementById("auth-trigger-icon-path");
const LOCKED_ICON_PATH = "M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Zm-9-2a3 3 0 0 1 6 0v2H9V6Z";
const UNLOCKED_ICON_PATH = "M18 8h-6V6a3 3 0 1 0-6 0 1 1 0 1 0 2 0 1 1 0 1 1 2 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Z";
const modal = document.getElementById("auth-modal");
const form = document.getElementById("auth-form");
const emailInput = document.getElementById("auth-email");
const passwordInput = document.getElementById("auth-password");
const errorEl = document.getElementById("auth-error");
const cancelBtn = document.getElementById("auth-cancel");
const editButtons = () => document.querySelectorAll("[data-requires-auth]");

function setEditMode(active) {
  editButtons().forEach((btn) => {
    btn.disabled = !active;
    btn.setAttribute("aria-disabled", String(!active));
  });
}

function syncAuthUi(user) {
  const isSignedIn = Boolean(user);
  trigger?.setAttribute(
    "aria-label",
    isSignedIn ? "Bearbeitungsmodus aktiv. Abmelden" : "Ansichtsmodus gesperrt. Anmelden",
  );
  triggerIconPath?.setAttribute("d", isSignedIn ? UNLOCKED_ICON_PATH : LOCKED_ICON_PATH);
  setEditMode(isSignedIn);
}

function authErrorMessage(code) {
  const map = {
    "auth/invalid-email": "Ungültige E-Mail-Adresse.",
    "auth/user-disabled": "Dieses Konto ist deaktiviert.",
    "auth/user-not-found": "Kein Konto mit dieser E-Mail.",
    "auth/wrong-password": "Falsches Passwort.",
    "auth/invalid-credential": "E-Mail oder Passwort ist falsch.",
    "auth/too-many-requests": "Zu viele Versuche. Bitte später erneut versuchen.",
    "auth/network-request-failed": "Netzwerkfehler. Verbindung prüfen.",
  };
  return map[code] || "Anmeldung fehlgeschlagen. Bitte erneut versuchen.";
}

function openModal() {
  if (errorEl) errorEl.textContent = "";
  modal.hidden = false;
  emailInput?.focus();
}

function closeModal() {
  modal.hidden = true;
  if (errorEl) errorEl.textContent = "";
}

onAuthStateChanged(auth, (user) => {
  syncAuthUi(user);
  if (user) closeModal();
});

trigger.addEventListener("click", async () => {
  if (auth.currentUser) {
    const shouldSignOut = window.confirm("Willst du dich wirklich abmelden?");
    if (!shouldSignOut) return;
    await signOut(auth);
    syncAuthUi(null);
    return;
  }
  openModal();
});

cancelBtn?.addEventListener("click", () => closeModal());

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (errorEl) errorEl.textContent = "";
  const email = emailInput?.value?.trim() ?? "";
  const password = passwordInput?.value ?? "";
  closeModal();
  try {
    await signInWithEmailAndPassword(auth, email, password);
    syncAuthUi(auth.currentUser);
    passwordInput.value = "";
  } catch (err) {
    openModal();
    if (errorEl) errorEl.textContent = authErrorMessage(err.code);
  }
});
