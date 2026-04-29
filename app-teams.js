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
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const CATEGORY_LABELS = {
  youth: "Jugendliche",
  adult_fun: "Erwachsene Plausch",
  adult_ambitious: "Erwachsene Ambitioniert",
};

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

const dashboardPanel = document.getElementById("dashboard-panel");
const dashboardTeamSelect = document.getElementById("dashboard-team-select");
const dashboardTitle = document.getElementById("dashboard-team-title");
const dashboardInfo = document.getElementById("dashboard-team-info");
const dashboardGroupTable = document.getElementById("dashboard-group-table");
const dashboardMatchTable = document.getElementById("dashboard-match-table");

let currentUser = null;
let allTeams = [];
let selectedTeamId = null;
let resultMap = {};
let selectedScheduleCategory = "adult_ambitious";

function openModal() { if (errorEl) errorEl.textContent = ""; modal.hidden = false; form?.teamName?.focus(); }
function closeModal() { modal.hidden = true; if (errorEl) errorEl.textContent = ""; form?.reset(); }

function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

function toGroupName(category, teamIndex) { return `${CATEGORY_LABELS[category]} Gruppe ${teamIndex % 2 === 0 ? "A" : "B"}`; }

function getTeamSchedule(team, teamsInCategory) {
  const teamIndex = teamsInCategory.findIndex((entry) => entry.id === team.id);
  const group = toGroupName(team.category, teamIndex);
  const groupPeers = teamsInCategory.filter((_, idx) => toGroupName(team.category, idx) === group);

  const groupGames = groupPeers
    .filter((peer) => peer.id !== team.id)
    .map((peer, idx) => ({
      id: `group-${team.id}-${peer.id}`,
      stage: "Vorrunde",
      time: `13:${String(idx * 12).padStart(2, "0")}`,
      field: `${team.category === "adult_ambitious" ? 1 : team.category === "adult_fun" ? 2 : 3}`,
      home: team.name,
      away: peer.name,
      editable: true,
    }));

  const finals = [
    { id: `final-1-${team.id}`, stage: "Finalrunde", time: "16:12", field: "1", home: `${CATEGORY_LABELS[team.category]} Rang 1`, away: `${CATEGORY_LABELS[team.category]} Rang 2`, editable: false },
    { id: `final-2-${team.id}`, stage: "Finalrunde", time: "16:24", field: "2", home: `${CATEGORY_LABELS[team.category]} Rang 3`, away: `${CATEGORY_LABELS[team.category]} Rang 4`, editable: false },
  ];

  return { group, groupPeers, matches: [...groupGames, ...finals] };
}

function renderTeamCard(team) {
  const canDelete = Boolean(currentUser);
  return `<li class="team-card" data-team-select="${team.id}"><div class="team-card-content"><p class="team-name">${escapeHtml(team.name)}</p><p class="team-meta">Gemeinde: ${escapeHtml(team.community)}</p><p class="team-meta">Mannschaftsverantwortlich: ${escapeHtml(team.manager)}</p></div>${canDelete ? `<button type="button" class="team-delete" data-team-id="${team.id}">Löschen</button>` : ""}</li>`;
}

function renderDashboardEmptyState() {
  if (!dashboardTitle || !dashboardInfo || !dashboardGroupTable || !dashboardMatchTable) return;
  dashboardTitle.textContent = "Team-Dashboard";
  dashboardInfo.textContent = "Wähle ein Team aus, um Spiele und Tabelle zu sehen.";
  dashboardGroupTable.innerHTML = '<tr><td colspan="2">Noch kein Team ausgewählt.</td></tr>';
  dashboardMatchTable.innerHTML = '<tr><td colspan="5">Noch kein Team ausgewählt.</td></tr>';
}

function renderGroupStandings(selectedTeam, groupPeers) {
  if (!dashboardGroupTable) return;
  const rows = groupPeers.map((peer) => {
    const points = Object.entries(resultMap).reduce((sum, [key, score]) => key.includes(peer.id) ? sum + (Number(score.home) > Number(score.away) ? 2 : 1) : sum, 0);
    return `<tr><td>${escapeHtml(peer.name)}</td><td>${points}</td></tr>`;
  });
  dashboardGroupTable.innerHTML = rows.join("") || `<tr><td>${escapeHtml(selectedTeam.name)}</td><td>0</td></tr>`;
}

function renderDashboardTeamOptions() {
  if (!dashboardTeamSelect) return;
  const options = allTeams
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .map((team) => `<option value="${team.id}">${escapeHtml(team.name)} (${CATEGORY_LABELS[team.category]})</option>`)
    .join("");
  dashboardTeamSelect.innerHTML = `<option value="">Bitte Team auswählen</option>${options}`;
  dashboardTeamSelect.value = selectedTeamId || "";
}

function renderTeamDashboard(teamId) {
  const selectedTeam = allTeams.find((team) => team.id === teamId);
  if (!selectedTeam) {
    selectedTeamId = null;
    if (dashboardTeamSelect) dashboardTeamSelect.value = "";
    renderDashboardEmptyState();
    return;
  }
  selectedTeamId = teamId;
  if (dashboardTeamSelect) dashboardTeamSelect.value = selectedTeamId;

  const teamsInCategory = allTeams.filter((team) => team.category === selectedTeam.category);
  const { group, groupPeers, matches } = getTeamSchedule(selectedTeam, teamsInCategory);

  dashboardTitle.textContent = selectedTeam.name;
  dashboardInfo.textContent = `${CATEGORY_LABELS[selectedTeam.category]} · ${group}`;

  renderGroupStandings(selectedTeam, groupPeers);

  dashboardMatchTable.innerHTML = matches
    .map((match) => {
      const score = resultMap[match.id] || { home: "", away: "" };
      const readOnly = !currentUser || !match.editable;
      const resultFields = readOnly
        ? `${score.home || "-"} : ${score.away || "-"}`
        : `<input type="number" min="0" class="result-input" data-result-match="${match.id}" data-side="home" value="${score.home}" /> : <input type="number" min="0" class="result-input" data-result-match="${match.id}" data-side="away" value="${score.away}" />`;
      return `<tr><td>${match.stage}</td><td>${match.time}</td><td>${match.field}</td><td>${escapeHtml(match.home)} vs ${escapeHtml(match.away)}</td><td>${resultFields}</td></tr>`;
    })
    .join("");
}

function renderTeams(teams) {
  const byCategory = { youth: [], adult_fun: [], adult_ambitious: [] };
  teams.forEach((team) => { if (byCategory[team.category]) byCategory[team.category].push(team); });
  Object.entries(teamLists).forEach(([category, listEl]) => {
    if (!listEl) return;
    const entries = byCategory[category];
    listEl.innerHTML = entries.length ? entries.map((team) => renderTeamCard(team)).join("") : '<li class="team-empty">Noch keine Teams erfasst.</li>';
  });
  renderDashboardTeamOptions();
  if (selectedTeamId) renderTeamDashboard(selectedTeamId); else renderDashboardEmptyState();
  renderSchedule();
}

function getRoundRobinMatches(teams, category) {
  const baseHour = 13;
  const baseMinute = 0;
  let gameIndex = 0;
  const field = category === "adult_ambitious" ? "1" : category === "adult_fun" ? "2" : "3";
  const matches = [];
  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      const totalMinutes = baseMinute + gameIndex * 12;
      const hour = baseHour + Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      matches.push({
        time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        field,
        home: teams[i],
        away: teams[j],
      });
      gameIndex += 1;
    }
  }
  return matches;
}

function renderSchedule() {
  const tableBody = document.getElementById("schedule-table-body");
  const description = document.getElementById("schedule-description");
  if (!tableBody) return;
  const teams = allTeams.filter((team) => team.category === selectedScheduleCategory);
  if (description) {
    description.textContent = `${CATEGORY_LABELS[selectedScheduleCategory]} · ${teams.length} Team(s) aus der Datenbank.`;
  }
  const matches = getRoundRobinMatches(teams, selectedScheduleCategory);
  tableBody.innerHTML = matches.length
    ? matches.map((match) => `<tr><td>${match.time}</td><td>${match.field}</td><td><button type="button" class="team-link" data-team-select="${match.home.id}">${escapeHtml(match.home.name)}</button> vs <button type="button" class="team-link" data-team-select="${match.away.id}">${escapeHtml(match.away.name)}</button></td></tr>`).join("")
    : '<tr><td colspan="3">Noch keine Teams für diese Kategorie erfasst.</td></tr>';
}

createButton?.addEventListener("click", () => openModal());
cancelBtn?.addEventListener("click", () => closeModal());

dashboardTeamSelect?.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  renderTeamDashboard(target.value);
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault(); if (!currentUser) return;
  const payload = { name: form.teamName.value.trim(), community: form.community.value.trim(), manager: form.manager.value.trim(), category: form.category.value, createdAt: serverTimestamp(), ownerUid: currentUser.uid };
  if (!payload.name || !payload.community || !payload.manager || !payload.category) { if (errorEl) errorEl.textContent = "Bitte alle Felder ausfüllen."; return; }
  try { await addDoc(collection(db, "teams"), payload); closeModal(); } catch { if (errorEl) errorEl.textContent = "Team konnte nicht gespeichert werden."; }
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (createButton) createButton.hidden = !user;
  if (!user) closeModal();
  document.querySelectorAll(".team-delete").forEach((button) => { button.hidden = !user; });
  if (selectedTeamId) renderTeamDashboard(selectedTeamId);
});

onSnapshot(query(collection(db, "teams"), orderBy("createdAt", "desc")), (snapshot) => {
  allTeams = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  renderTeams(allTeams);
});

document.getElementById("schedule-category-filter")?.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  selectedScheduleCategory = target.value;
  renderSchedule();
});

onSnapshot(collection(db, "matchResults"), (snapshot) => {
  resultMap = snapshot.docs.reduce((acc, entry) => ({ ...acc, [entry.id]: entry.data() }), {});
  if (selectedTeamId) renderTeamDashboard(selectedTeamId);
});

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const teamCard = target.closest("[data-team-select]");
  if (teamCard && !(target.matches(".team-delete"))) {
    renderTeamDashboard(teamCard.getAttribute("data-team-select"));
    setView("dashboard");
  }
  if (!target.matches(".team-delete")) return;
  if (!currentUser) return;
  const teamId = target.dataset.teamId;
  if (!teamId) return;
  await deleteDoc(doc(db, "teams", teamId));
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.matches(".result-input") || !currentUser) return;
  const matchId = target.dataset.resultMatch;
  const side = target.dataset.side;
  if (!matchId || !side) return;
  const next = { ...(resultMap[matchId] || { home: "", away: "" }), [side]: target.value };
  await setDoc(doc(db, "matchResults", matchId), next, { merge: true });
});

const teamsViewBtn = document.getElementById("show-teams");
const scheduleViewBtn = document.getElementById("show-schedule");
const dashboardViewBtn = document.getElementById("show-dashboard");
const teamsPanel = document.getElementById("teams-panel");
const schedulePanel = document.getElementById("schedule-panel");
function setView(view) {
  const showTeams = view === "teams";
  const showSchedule = view === "schedule";
  const showDashboard = view === "dashboard";
  if (teamsPanel) teamsPanel.hidden = !showTeams;
  if (schedulePanel) schedulePanel.hidden = !showSchedule;
  if (dashboardPanel) dashboardPanel.hidden = !showDashboard;
  teamsViewBtn?.classList.toggle("is-active", showTeams);
  scheduleViewBtn?.classList.toggle("is-active", showSchedule);
  dashboardViewBtn?.classList.toggle("is-active", showDashboard);
  teamsViewBtn?.setAttribute("aria-expanded", String(showTeams));
  scheduleViewBtn?.setAttribute("aria-expanded", String(showSchedule));
  dashboardViewBtn?.setAttribute("aria-expanded", String(showDashboard));
}
teamsViewBtn?.addEventListener("click", () => setView("teams"));
scheduleViewBtn?.addEventListener("click", () => setView("schedule"));
dashboardViewBtn?.addEventListener("click", () => setView("dashboard"));
setView("none");
