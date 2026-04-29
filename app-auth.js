import { auth } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const trigger = document.getElementById("auth-trigger");
const triggerIconPath = document.getElementById("auth-trigger-icon-path");
const LOCKED_ICON_PATH = "M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4V6Z";
const UNLOCKED_ICON_PATH = "M17 8h-6V6a2 2 0 1 1 3.46 1.38 1 1 0 1 0 1.54 1.24A4 4 0 1 0 9 6v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Z";
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
  if (user) {
    trigger.setAttribute("aria-label", "Bearbeitungsmodus aktiv. Abmelden");
    triggerIconPath?.setAttribute("d", UNLOCKED_ICON_PATH);
    setEditMode(true);
    closeModal();
  } else {
    trigger.setAttribute("aria-label", "Ansichtsmodus gesperrt. Anmelden");
    triggerIconPath?.setAttribute("d", LOCKED_ICON_PATH);
    setEditMode(false);
  }
});

trigger.addEventListener("click", async () => {
  if (auth.currentUser) {
    await signOut(auth);
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
    passwordInput.value = "";
  } catch (err) {
    openModal();
    if (errorEl) errorEl.textContent = authErrorMessage(err.code);
  }
});
