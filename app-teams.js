import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const teamLists = {
  youth: document.getElementById("teams-list-youth"),
  adult_fun: document.getElementById("teams-list-adult-fun"),
  adult_ambitious: document.getElementById("teams-list-adult-ambitious"),
};

const createButton = document.getElementById("team-create-trigger");
const modal = document.getElementById("team-modal");
const form = document.getElementById("team-form");
const cancelBtn = document.getElementById("team-cancel");
const errorEl = document.getElementById("team-error");

let currentUser = null;

function openModal() {
  if (errorEl) errorEl.textContent = "";
  modal.hidden = false;
  form?.teamName?.focus();
}

function closeModal() {
  modal.hidden = true;
  if (errorEl) errorEl.textContent = "";
  form?.reset();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderTeamCard(team) {
  const canDelete = Boolean(currentUser);
  return `
    <li class="team-card">
      <div class="team-card-content">
        <p class="team-name">${escapeHtml(team.name)}</p>
        <p class="team-meta">Gemeinde: ${escapeHtml(team.community)}</p>
        <p class="team-meta">Mannschaftsverantwortlich: ${escapeHtml(team.manager)}</p>
      </div>
      ${canDelete ? `<button type="button" class="team-delete" data-team-id="${team.id}">Löschen</button>` : ""}
    </li>
  `;
}

function renderTeams(teams) {
  const byCategory = {
    youth: [],
    adult_fun: [],
    adult_ambitious: [],
  };

  teams.forEach((team) => {
    if (byCategory[team.category]) byCategory[team.category].push(team);
  });

  Object.entries(teamLists).forEach(([category, listEl]) => {
    if (!listEl) return;
    const entries = byCategory[category];
    if (!entries.length) {
      listEl.innerHTML = '<li class="team-empty">Noch keine Teams erfasst.</li>';
      return;
    }

    listEl.innerHTML = entries.map((team) => renderTeamCard(team)).join("");
  });
}

createButton?.addEventListener("click", () => openModal());
cancelBtn?.addEventListener("click", () => closeModal());

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;

  const payload = {
    name: form.teamName.value.trim(),
    community: form.community.value.trim(),
    manager: form.manager.value.trim(),
    category: form.category.value,
    createdAt: serverTimestamp(),
    ownerUid: currentUser.uid,
  };

  if (!payload.name || !payload.community || !payload.manager || !payload.category) {
    if (errorEl) errorEl.textContent = "Bitte alle Felder ausfüllen.";
    return;
  }

  try {
    await addDoc(collection(db, "teams"), payload);
    closeModal();
  } catch (error) {
    if (errorEl) errorEl.textContent = "Team konnte nicht gespeichert werden.";
  }
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (createButton) createButton.hidden = !user;
  if (!user) closeModal();
  const deleteButtons = document.querySelectorAll(".team-delete");
  deleteButtons.forEach((button) => {
    button.hidden = !user;
  });
});

const teamsRef = query(collection(db, "teams"), orderBy("createdAt", "desc"));
onSnapshot(teamsRef, (snapshot) => {
  const teams = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  renderTeams(teams);
});

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.matches(".team-delete")) return;
  if (!currentUser) return;

  const teamId = target.dataset.teamId;
  if (!teamId) return;

  await deleteDoc(doc(db, "teams", teamId));
});


const teamsViewBtn = document.getElementById("show-teams");
const scheduleViewBtn = document.getElementById("show-schedule");
const teamsPanel = document.getElementById("teams-panel");
const schedulePanel = document.getElementById("schedule-panel");

function setView(view) {
  const showTeams = view === "teams";
  const showSchedule = view === "schedule";

  if (teamsPanel) teamsPanel.hidden = !showTeams;
  if (schedulePanel) schedulePanel.hidden = !showSchedule;

  teamsViewBtn?.classList.toggle("is-active", showTeams);
  scheduleViewBtn?.classList.toggle("is-active", showSchedule);

  teamsViewBtn?.setAttribute("aria-expanded", String(showTeams));
  scheduleViewBtn?.setAttribute("aria-expanded", String(showSchedule));
}

teamsViewBtn?.addEventListener("click", () => setView("teams"));
scheduleViewBtn?.addEventListener("click", () => setView("schedule"));

setView("none");
