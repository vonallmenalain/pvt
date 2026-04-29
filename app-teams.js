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

/**
 * Optimized 6-team schedule (10 min games, 2 min breaks, 12 min slots).
 * Start: 11:30 · End: 16:52 · 27 slots total.
 *
 * Each entry is [homeIndex, awayIndex] (0-based into teamsInCategory).
 * Ordering within each 3-game round is chosen so that no team appears in
 * the last slot of round N AND the first slot of round N+1 (ensures every
 * team has at least 1 free slot between consecutive appearances).
 *
 * Round labels (for display):
 * R1–R5: first full round-robin (all 15 unique pairings)
 * R6–R8: rematch rounds (repeat R1–R3 in transition-safe order)
 * Slots 25–27: finals (rank-based, determined at run-time)
 */
const OPTIMIZED_SCHEDULE = [
  // R1 – top seeds clash first
  { r: "Vorrunde R1",  h: 0, a: 1 },
  { r: "Vorrunde R1",  h: 2, a: 3 },
  { r: "Vorrunde R1",  h: 4, a: 5 },
  // R2
  { r: "Vorrunde R2",  h: 0, a: 2 },
  { r: "Vorrunde R2",  h: 1, a: 4 },
  { r: "Vorrunde R2",  h: 3, a: 5 },
  // R3 – reordered so T3/T5 start (avoids T4 back-to-back at R2/R3 boundary)
  { r: "Vorrunde R3",  h: 2, a: 4 },
  { r: "Vorrunde R3",  h: 0, a: 3 },
  { r: "Vorrunde R3",  h: 1, a: 5 },
  // R4
  { r: "Vorrunde R4",  h: 0, a: 4 },
  { r: "Vorrunde R4",  h: 1, a: 3 },
  { r: "Vorrunde R4",  h: 2, a: 5 },
  // R5 – T4/T5 start (avoids T3/T6 back-to-back at R4/R5 boundary)
  { r: "Vorrunde R5",  h: 3, a: 4 },
  { r: "Vorrunde R5",  h: 0, a: 5 },
  { r: "Vorrunde R5",  h: 1, a: 2 },
  // R6 – rematches R1, T5/T6 start (avoids T2/T3 back-to-back at R5/R6 boundary)
  { r: "Vorrunde R6",  h: 4, a: 5 },
  { r: "Vorrunde R6",  h: 0, a: 1 },
  { r: "Vorrunde R6",  h: 2, a: 3 },
  // R7 – rematches R2, T2/T5 start (avoids T3/T4 back-to-back at R6/R7 boundary)
  { r: "Vorrunde R7",  h: 1, a: 4 },
  { r: "Vorrunde R7",  h: 0, a: 2 },
  { r: "Vorrunde R7",  h: 3, a: 5 },
  // R8 – rematches R3, T3/T5 start (avoids T4/T6 back-to-back at R7/R8 boundary)
  { r: "Vorrunde R8",  h: 2, a: 4 },
  { r: "Vorrunde R8",  h: 0, a: 3 },
  { r: "Vorrunde R8",  h: 1, a: 5 },
];

const SLOT_START_MINUTES = 11 * 60 + 30; // 11:30 in minutes from midnight
const SLOT_DURATION_MIN = 12;             // 10 min play + 2 min break

function slotTime(slotIndex) {
  const total = SLOT_START_MINUTES + slotIndex * SLOT_DURATION_MIN;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getTeamSchedule(team, teamsInCategory) {
  const teamIndex = teamsInCategory.findIndex((entry) => entry.id === team.id);
  const field = team.category === "adult_ambitious" ? "1" : team.category === "adult_fun" ? "2" : "3";
  const label = CATEGORY_LABELS[team.category];

  const groupGames = OPTIMIZED_SCHEDULE
    .map((entry, slotIdx) => ({ entry, slotIdx }))
    .filter(({ entry }) => entry.h === teamIndex || entry.a === teamIndex)
    .map(({ entry, slotIdx }) => {
      const homeTeam = teamsInCategory[entry.h];
      const awayTeam = teamsInCategory[entry.a];
      if (!homeTeam || !awayTeam) return null;
      const id = `match-${team.category}-${slotIdx}-${entry.h}-${entry.a}`;
      return {
        id,
        stage: entry.r,
        time: slotTime(slotIdx),
        field,
        home: homeTeam.name,
        away: awayTeam.name,
        editable: true,
      };
    })
    .filter(Boolean);

  const finals = [
    { id: `final-5-${team.category}`, stage: "Platz 5", time: slotTime(24), field, home: `${label} Rang 5`, away: `${label} Rang 6`, editable: false },
    { id: `final-3-${team.category}`, stage: "Platz 3", time: slotTime(25), field, home: `${label} Rang 3`, away: `${label} Rang 4`, editable: false },
    { id: `final-1-${team.category}`, stage: "Finale",  time: slotTime(26), field, home: `${label} Rang 1`, away: `${label} Rang 2`, editable: false },
  ];

  const group = `${label}`;
  const groupPeers = teamsInCategory;
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

function calcTeamPoints(peerTeam, teamsInCategory) {
  const peerIndex = teamsInCategory.findIndex((t) => t.id === peerTeam.id);
  return OPTIMIZED_SCHEDULE.reduce((sum, entry, slotIdx) => {
    const isHome = entry.h === peerIndex;
    const isAway = entry.a === peerIndex;
    if (!isHome && !isAway) return sum;
    const matchId = `match-${peerTeam.category}-${slotIdx}-${entry.h}-${entry.a}`;
    const score = resultMap[matchId];
    if (!score || (score.home === "" && score.away === "")) return sum;
    const homeScore = Number(score.home);
    const awayScore = Number(score.away);
    if (homeScore === awayScore) return sum + 1;
    if (isHome) return sum + (homeScore > awayScore ? 3 : 0);
    return sum + (awayScore > homeScore ? 3 : 0);
  }, 0);
}

function renderGroupStandings(selectedTeam, groupPeers) {
  if (!dashboardGroupTable) return;
  const teamsInCategory = allTeams.filter((team) => team.category === selectedTeam.category);
  const rows = groupPeers
    .map((peer) => ({ peer, pts: calcTeamPoints(peer, teamsInCategory) }))
    .sort((a, b) => b.pts - a.pts)
    .map(({ peer, pts }) => `<tr><td>${escapeHtml(peer.name)}</td><td>${pts}</td></tr>`);
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
  dashboardInfo.textContent = CATEGORY_LABELS[selectedTeam.category];

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

function getScheduleMatches(teams, category) {
  const field = category === "adult_ambitious" ? "1" : category === "adult_fun" ? "2" : "3";
  const label = CATEGORY_LABELS[category];

  if (teams.length < 2) return [];

  const preliminaryMatches = OPTIMIZED_SCHEDULE.map((entry, slotIdx) => {
    const homeTeam = teams[entry.h];
    const awayTeam = teams[entry.a];
    if (!homeTeam || !awayTeam) return null;
    return {
      stage: entry.r,
      time: slotTime(slotIdx),
      field,
      home: homeTeam,
      away: awayTeam,
    };
  }).filter(Boolean);

  const finalMatches = [
    { stage: "Platz 5", time: slotTime(24), field, home: { name: `${label} Rang 5`, id: null }, away: { name: `${label} Rang 6`, id: null } },
    { stage: "Platz 3", time: slotTime(25), field, home: { name: `${label} Rang 3`, id: null }, away: { name: `${label} Rang 4`, id: null } },
    { stage: "Finale",  time: slotTime(26), field, home: { name: `${label} Rang 1`, id: null }, away: { name: `${label} Rang 2`, id: null } },
  ];

  return [...preliminaryMatches, ...finalMatches];
}

function renderSchedule() {
  const tableBody = document.getElementById("schedule-table-body");
  const description = document.getElementById("schedule-description");
  if (!tableBody) return;
  const teams = allTeams.filter((team) => team.category === selectedScheduleCategory);
  if (description) {
    description.textContent = `${CATEGORY_LABELS[selectedScheduleCategory]} · ${teams.length} Team(s) · 10 Min. Spielzeit · Start 11:30 · Finals ab 16:18`;
  }
  const matches = getScheduleMatches(teams, selectedScheduleCategory);
  if (!matches.length) {
    tableBody.innerHTML = '<tr><td colspan="4">Noch keine Teams für diese Kategorie erfasst.</td></tr>';
    return;
  }
  tableBody.innerHTML = matches.map((match) => {
    const homeLink = match.home.id
      ? `<button type="button" class="team-link" data-team-select="${match.home.id}">${escapeHtml(match.home.name)}</button>`
      : escapeHtml(match.home.name);
    const awayLink = match.away.id
      ? `<button type="button" class="team-link" data-team-select="${match.away.id}">${escapeHtml(match.away.name)}</button>`
      : escapeHtml(match.away.name);
    return `<tr><td>${escapeHtml(match.stage)}</td><td>${match.time}</td><td>${match.field}</td><td>${homeLink} vs ${awayLink}</td></tr>`;
  }).join("");
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
