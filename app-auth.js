import { auth } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const trigger = document.getElementById("auth-trigger");
const modal = document.getElementById("auth-modal");
const form = document.getElementById("auth-form");
const emailInput = document.getElementById("auth-email");
const passwordInput = document.getElementById("auth-password");
const errorEl = document.getElementById("auth-error");
const cancelBtn = document.getElementById("auth-cancel");
const editHint = document.getElementById("edit-hint");
const editButtons = () => document.querySelectorAll("[data-requires-auth]");

function setEditMode(active) {
  editButtons().forEach((btn) => {
    btn.disabled = !active;
    btn.setAttribute("aria-disabled", String(!active));
  });
  if (editHint) {
    editHint.hidden = active;
  }
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
    trigger.textContent = "Abmelden";
    trigger.setAttribute("aria-label", "Abmelden");
    setEditMode(true);
    closeModal();
  } else {
    trigger.textContent = "Anmelden";
    trigger.setAttribute("aria-label", "Anmelden");
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

modal?.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal && !modal.hidden) closeModal();
});

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (errorEl) errorEl.textContent = "";
  const email = emailInput?.value?.trim() ?? "";
  const password = passwordInput?.value ?? "";
  try {
    await signInWithEmailAndPassword(auth, email, password);
    passwordInput.value = "";
  } catch (err) {
    if (errorEl) errorEl.textContent = authErrorMessage(err.code);
  }
});
