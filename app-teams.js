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
 * 6-team single round-robin group phase (15 unique pairings).
 * 12 min games, 2 min breaks → 14 min slots. Start: 11:30.
 * Slots 0–14: group phase · Slots 15–22: finals (rank-based, determined at run-time)
 */
const OPTIMIZED_SCHEDULE = [
  { r: "Gruppenphase", h: 0, a: 1 },
  { r: "Gruppenphase", h: 2, a: 3 },
  { r: "Gruppenphase", h: 4, a: 5 },
  { r: "Gruppenphase", h: 0, a: 2 },
  { r: "Gruppenphase", h: 1, a: 4 },
  { r: "Gruppenphase", h: 3, a: 5 },
  { r: "Gruppenphase", h: 2, a: 4 },
  { r: "Gruppenphase", h: 0, a: 3 },
  { r: "Gruppenphase", h: 1, a: 5 },
  { r: "Gruppenphase", h: 3, a: 4 },
  { r: "Gruppenphase", h: 1, a: 2 },
  { r: "Gruppenphase", h: 0, a: 5 },
  { r: "Gruppenphase", h: 1, a: 3 },
  { r: "Gruppenphase", h: 0, a: 4 },
  { r: "Gruppenphase", h: 2, a: 5 },
];

const SLOT_START_MINUTES = 11 * 60 + 30; // 11:30 in minutes from midnight
const SLOT_DURATION_MIN = 14;             // 12 min play + 2 min break
const GAME_DURATION_MIN = 12;

function slotTime(slotIndex) {
  const start = SLOT_START_MINUTES + slotIndex * SLOT_DURATION_MIN;
  const end = start + GAME_DURATION_MIN;
  const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  return `${fmt(start)}–${fmt(end)}`;
}

/**
 * Calculate full stats for a team (points, GF, GA) across all group matches.
 * Win = 2 pts, Draw = 1 pt each, Loss = 0 pts.
 */
function calcTeamStats(peerTeam, teamsInCategory) {
  const peerIndex = teamsInCategory.findIndex((t) => t.id === peerTeam.id);
  let pts = 0, gf = 0, ga = 0, played = 0;
  OPTIMIZED_SCHEDULE.forEach((entry, slotIdx) => {
    const isHome = entry.h === peerIndex;
    const isAway = entry.a === peerIndex;
    if (!isHome && !isAway) return;
    const matchId = `match-${peerTeam.category}-${slotIdx}-${entry.h}-${entry.a}`;
    const score = resultMap[matchId];
    if (!score || (score.home === "" && score.away === "")) return;
    const homeScore = Number(score.home);
    const awayScore = Number(score.away);
    played++;
    if (isHome) { gf += homeScore; ga += awayScore; }
    else { gf += awayScore; ga += homeScore; }
    if (homeScore === awayScore) { pts += 1; }
    else if ((isHome && homeScore > awayScore) || (isAway && awayScore > homeScore)) { pts += 2; }
  });
  return { pts, gf, ga, played };
}

/** Legacy wrapper – still used where only points are needed */
function calcTeamPoints(peerTeam, teamsInCategory) {
  return calcTeamStats(peerTeam, teamsInCategory).pts;
}

/**
 * Sort teams in category by: 1) pts desc, 2) gf desc, 3) gf/ga ratio desc.
 * Returns array of { team, pts, gf, ga, played } sorted by rank.
 */
function getSortedStandings(teamsInCategory) {
  return teamsInCategory
    .map((team) => ({ team, ...calcTeamStats(team, teamsInCategory) }))
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gf !== a.gf) return b.gf - a.gf;
      const ratioA = a.ga === 0 ? (a.gf > 0 ? Infinity : 0) : a.gf / a.ga;
      const ratioB = b.ga === 0 ? (b.gf > 0 ? Infinity : 0) : b.gf / b.ga;
      return ratioB - ratioA;
    });
}

/**
 * Resolve final-round participant names from current standings.
 * Returns an object keyed by placeholder strings → real team names (or placeholder if not determined).
 */
function resolveFinalNames(category) {
  const teams = allTeams.filter((t) => t.category === category);
  const label = CATEGORY_LABELS[category];
  const standings = getSortedStandings(teams);

  // Check if ALL group matches have been played (results entered)
  const allGroupMatchesPlayed = OPTIMIZED_SCHEDULE.every((entry, slotIdx) => {
    if (teams.length < Math.max(entry.h, entry.a) + 1) return false;
    const matchId = `match-${category}-${slotIdx}-${entry.h}-${entry.a}`;
    const score = resultMap[matchId];
    return score && score.home !== "" && score.away !== "";
  });

  const resolved = {};
  if (allGroupMatchesPlayed && standings.length >= 6) {
    resolved[`${label} Rang 1`] = standings[0].team.name;
    resolved[`${label} Rang 2`] = standings[1].team.name;
    resolved[`${label} Rang 3`] = standings[2].team.name;
    resolved[`${label} Rang 4`] = standings[3].team.name;
    resolved[`${label} Rang 5`] = standings[4].team.name;
    resolved[`${label} Rang 6`] = standings[5].team.name;
  }
  return resolved;
}

/**
 * Resolve a participant name – use resolved map if available, else original placeholder.
 */
function resolveName(name, resolvedMap) {
  return resolvedMap[name] || name;
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
        homeId: homeTeam.id,
        away: awayTeam.name,
        awayId: awayTeam.id,
        editable: true,
      };
    })
    .filter(Boolean);

  // Resolve final names from standings
  const resolvedMap = resolveFinalNames(team.category);
  const standings = getSortedStandings(teamsInCategory);

  // Determine the rank of this team (1-based) if group phase is resolved
  const teamRank = standings.findIndex((s) => s.team.id === team.id) + 1;

  // Build finals list with resolved names
  const r1 = resolveName(`${label} Rang 1`, resolvedMap);
  const r2 = resolveName(`${label} Rang 2`, resolvedMap);
  const r3 = resolveName(`${label} Rang 3`, resolvedMap);
  const r4 = resolveName(`${label} Rang 4`, resolvedMap);
  const r5 = resolveName(`${label} Rang 5`, resolvedMap);
  const r6 = resolveName(`${label} Rang 6`, resolvedMap);

  const vfaHome = r3, vfaAway = r6;
  const vfbHome = r4, vfbAway = r5;
  const tqHome = r1, tqAway = r2;

  /** Look up a team's ID by name within the category, returning null if not found. */
  const teamIdByName = (name) => teamsInCategory.find((t) => t.name === name)?.id ?? null;

  const allFinals = [
    { id: `final-vfa-${team.category}`,  stage: "Viertelfinal A", time: slotTime(15), field, home: vfaHome, homeId: teamIdByName(vfaHome), away: vfaAway, awayId: teamIdByName(vfaAway), editable: false },
    { id: `final-vfb-${team.category}`,  stage: "Viertelfinal B", time: slotTime(16), field, home: vfbHome, homeId: teamIdByName(vfbHome), away: vfbAway, awayId: teamIdByName(vfbAway), editable: false },
    { id: `final-tq-${team.category}`,   stage: "Top-Quali",      time: slotTime(17), field, home: tqHome,  homeId: teamIdByName(tqHome),  away: tqAway,  awayId: teamIdByName(tqAway),  editable: false },
    { id: `final-koq-${team.category}`,  stage: "K.o.-Quali",     time: slotTime(18), field, home: `Sieger Viertelf. A`,    homeId: null, away: `Sieger Viertelf. B`,    awayId: null, editable: false },
    { id: `final-p5-${team.category}`,   stage: "Platz 5",        time: slotTime(19), field, home: `Verlierer Viertelf. A`, homeId: null, away: `Verlierer Viertelf. B`, awayId: null, editable: false },
    { id: `final-hf-${team.category}`,   stage: "Halbfinal",      time: slotTime(20), field, home: `Verlierer Top-Quali`,   homeId: null, away: `Sieger K.o.-Quali`,     awayId: null, editable: false },
    { id: `final-p3-${team.category}`,   stage: "Platz 3",        time: slotTime(21), field, home: `Verlierer K.o.-Quali`,  homeId: null, away: `Verlierer Halbfinal`,    awayId: null, editable: false },
    { id: `final-1-${team.category}`,    stage: "Finale",         time: slotTime(22), field, home: `Sieger Top-Quali`,      homeId: null, away: `Sieger Halbfinal`,       awayId: null, editable: false },
  ];

  // Only show finals that are relevant for this team
  // If rank is known, filter to the specific path through the bracket
  let relevantFinals;
  if (teamRank === 0 || !Object.keys(resolvedMap).length) {
    // Rankings not resolved yet – show all finals as placeholders
    relevantFinals = allFinals;
  } else {
    // Show only the one final in round 1 (VFA, VFB, or TQ) that this team participates in
    // and the downstream finals. Since we don't track per-final results, show all.
    // But we hide the finals the team definitely cannot be in.
    const teamName = team.name;
    const inVFA = vfaHome === teamName || vfaAway === teamName;
    const inVFB = vfbHome === teamName || vfbAway === teamName;
    const inTQ  = tqHome === teamName || tqAway === teamName;

    if (inVFA) {
      // Viertelfinal A path: VFA → K.o.-Quali/Platz 5 → Halbfinal/Platz 3/Platz 5 → Finale
      relevantFinals = allFinals.filter(f =>
        !["Viertelfinal B", "Top-Quali"].includes(f.stage)
      );
    } else if (inVFB) {
      relevantFinals = allFinals.filter(f =>
        !["Viertelfinal A", "Top-Quali"].includes(f.stage)
      );
    } else if (inTQ) {
      // Top-Quali path: TQ → Halbfinal/Finale
      relevantFinals = allFinals.filter(f =>
        !["Viertelfinal A", "Viertelfinal B"].includes(f.stage)
      );
    } else {
      relevantFinals = allFinals;
    }
  }

  const group = `${label}`;
  const groupPeers = teamsInCategory;
  return { group, groupPeers, matches: [...groupGames, ...relevantFinals] };
}

function renderTeamCard(team) {
  const canDelete = Boolean(currentUser);
  return `<li class="team-card" data-team-select="${team.id}"><div class="team-card-content"><p class="team-name">${escapeHtml(team.name)}</p><p class="team-meta">Gemeinde: ${escapeHtml(team.community)}</p><p class="team-meta">Mannschaftsverantwortlich: ${escapeHtml(team.manager)}</p></div>${canDelete ? `<button type="button" class="team-delete" data-team-id="${team.id}">Löschen</button>` : ""}</li>`;
}

function renderDashboardEmptyState() {
  if (!dashboardTitle || !dashboardInfo || !dashboardGroupTable || !dashboardMatchTable) return;
  dashboardTitle.textContent = "Team-Dashboard";
  dashboardInfo.textContent = "Wähle ein Team aus, um Spiele und Tabelle zu sehen.";
  dashboardGroupTable.innerHTML = '<tr><td colspan="7">Noch kein Team ausgewählt.</td></tr>';
  dashboardMatchTable.innerHTML = '<tr><td colspan="4">Noch kein Team ausgewählt.</td></tr>';
}

function renderGroupStandings(selectedTeam, groupPeers) {
  if (!dashboardGroupTable) return;
  const teamsInCategory = allTeams.filter((team) => team.category === selectedTeam.category);
  const rows = getSortedStandings(teamsInCategory)
    .map(({ team, pts, gf, ga, played }, idx) => {
      const ratio = ga === 0 ? (gf > 0 ? "∞" : "0") : (gf / ga).toFixed(2);
      const highlight = team.id === selectedTeam.id ? ' style="font-weight:700;background:rgba(40,53,147,0.25);"' : "";
      const nameCell = `<button type="button" class="team-link" data-team-select="${team.id}">${escapeHtml(team.name)}</button>`;
      return `<tr${highlight}><td>${idx + 1}</td><td>${nameCell}</td><td>${played}</td><td>${pts}</td><td>${gf}</td><td>${ga}</td><td>${ratio}</td></tr>`;
    });
  dashboardGroupTable.innerHTML = rows.join("") || `<tr><td>1</td><td>${escapeHtml(selectedTeam.name)}</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>`;
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
      const scoreCell = readOnly
        ? `<span class="schedule-result">${score.home !== "" && score.away !== "" ? `${score.home} : ${score.away}` : "–"}</span>`
        : `<span class="schedule-result"><input type="number" min="0" class="result-input" data-result-match="${match.id}" data-side="home" value="${score.home}" /> : <input type="number" min="0" class="result-input" data-result-match="${match.id}" data-side="away" value="${score.away}" /></span>`;
      const homeCell = match.homeId
        ? `<button type="button" class="team-link" data-team-select="${match.homeId}">${escapeHtml(match.home)}</button>`
        : escapeHtml(match.home);
      const awayCell = match.awayId
        ? `<button type="button" class="team-link" data-team-select="${match.awayId}">${escapeHtml(match.away)}</button>`
        : escapeHtml(match.away);
      return `<tr><td>${match.stage}</td><td class="col-time">${match.time}</td><td>${match.field}</td><td class="col-game"><div class="col-game-inner"><span class="col-game-home">${homeCell}</span><span class="col-game-score">${scoreCell}</span><span class="col-game-away">${awayCell}</span></div></td></tr>`;
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

  const resolvedMap = resolveFinalNames(category);

  const preliminaryMatches = OPTIMIZED_SCHEDULE.map((entry, slotIdx) => {
    const homeTeam = teams[entry.h];
    const awayTeam = teams[entry.a];
    if (!homeTeam || !awayTeam) return null;
    const id = `match-${category}-${slotIdx}-${entry.h}-${entry.a}`;
    return {
      id,
      nr: slotIdx + 1,
      stage: entry.r,
      time: slotTime(slotIdx),
      field,
      home: homeTeam,
      away: awayTeam,
    };
  }).filter(Boolean);

  const r1 = resolveName(`${label} Rang 1`, resolvedMap);
  const r2 = resolveName(`${label} Rang 2`, resolvedMap);
  const r3 = resolveName(`${label} Rang 3`, resolvedMap);
  const r4 = resolveName(`${label} Rang 4`, resolvedMap);
  const r5 = resolveName(`${label} Rang 5`, resolvedMap);
  const r6 = resolveName(`${label} Rang 6`, resolvedMap);

  const finalMatches = [
    { id: `final-vfa-${category}`,  nr: 16, stage: "Viertelfinal A", time: slotTime(15), field, home: { name: r3, id: null }, away: { name: r6, id: null } },
    { id: `final-vfb-${category}`,  nr: 17, stage: "Viertelfinal B", time: slotTime(16), field, home: { name: r4, id: null }, away: { name: r5, id: null } },
    { id: `final-tq-${category}`,   nr: 18, stage: "Top-Quali",      time: slotTime(17), field, home: { name: r1, id: null }, away: { name: r2, id: null } },
    { id: `final-koq-${category}`,  nr: 19, stage: "K.o.-Quali",     time: slotTime(18), field, home: { name: "Sieger Viertelf. A", id: null }, away: { name: "Sieger Viertelf. B", id: null } },
    { id: `final-p5-${category}`,   nr: 20, stage: "Platz 5",        time: slotTime(19), field, home: { name: "Verlierer Viertelf. A", id: null }, away: { name: "Verlierer Viertelf. B", id: null } },
    { id: `final-hf-${category}`,   nr: 21, stage: "Halbfinal",      time: slotTime(20), field, home: { name: "Verlierer Top-Quali", id: null }, away: { name: "Sieger K.o.-Quali", id: null } },
    { id: `final-p3-${category}`,   nr: 22, stage: "Platz 3",        time: slotTime(21), field, home: { name: "Verlierer K.o.-Quali", id: null }, away: { name: "Verlierer Halbfinal", id: null } },
    { id: `final-1-${category}`,    nr: 23, stage: "Finale",         time: slotTime(22), field, home: { name: "Sieger Top-Quali", id: null }, away: { name: "Sieger Halbfinal", id: null } },
  ];

  return [...preliminaryMatches, ...finalMatches];
}

function renderSchedule() {
  const tableBody = document.getElementById("schedule-table-body");
  if (!tableBody) return;
  const teams = allTeams.filter((team) => team.category === selectedScheduleCategory);
  const matches = getScheduleMatches(teams, selectedScheduleCategory);
  if (!matches.length) {
    tableBody.innerHTML = '<tr><td colspan="5">Noch keine Teams für diese Kategorie erfasst.</td></tr>';
    return;
  }
  tableBody.innerHTML = matches.map((match) => {
    const homeLink = match.home.id
      ? `<button type="button" class="team-link" data-team-select="${match.home.id}">${escapeHtml(match.home.name)}</button>`
      : escapeHtml(match.home.name);
    const awayLink = match.away.id
      ? `<button type="button" class="team-link" data-team-select="${match.away.id}">${escapeHtml(match.away.name)}</button>`
      : escapeHtml(match.away.name);

    const score = resultMap[match.id] || { home: "", away: "" };
    let resultCell;
    if (!match.id || match.id.startsWith("final-")) {
      // Final round games: always read-only in Spielplan
      resultCell = `<span class="schedule-result">${score.home !== "" && score.away !== "" ? `${score.home} : ${score.away}` : "–"}</span>`;
    } else if (currentUser) {
      resultCell = `<span class="schedule-result"><input type="number" min="0" class="result-input" data-result-match="${match.id}" data-side="home" value="${score.home}" /> : <input type="number" min="0" class="result-input" data-result-match="${match.id}" data-side="away" value="${score.away}" /></span>`;
    } else {
      resultCell = `<span class="schedule-result">${score.home !== "" && score.away !== "" ? `${score.home} : ${score.away}` : "–"}</span>`;
    }

    return `<tr><td>${match.nr}</td><td>${escapeHtml(match.stage)}</td><td class="col-time">${match.time}</td><td>${match.field}</td><td class="col-game"><div class="col-game-inner"><span class="col-game-home">${homeLink}</span><span class="col-game-score">${resultCell}</span><span class="col-game-away">${awayLink}</span></div></td></tr>`;
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
  // Re-render schedule when auth changes (editable inputs appear/disappear)
  renderSchedule();
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

onSnapshot(collection(db, "resultate"), (snapshot) => {
  resultMap = snapshot.docs.reduce((acc, entry) => ({ ...acc, [entry.id]: entry.data() }), {});
  // Re-render schedule to update results and potentially resolved final names
  renderSchedule();
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
  await setDoc(doc(db, "resultate", matchId), next, { merge: true });
});

const infosViewBtn = document.getElementById("show-infos");
const teamsViewBtn = document.getElementById("show-teams");
const scheduleViewBtn = document.getElementById("show-schedule");
const dashboardViewBtn = document.getElementById("show-dashboard");
const infosPanel = document.getElementById("infos-panel");
const teamsPanel = document.getElementById("teams-panel");
const schedulePanel = document.getElementById("schedule-panel");
function setView(view) {
  const showInfos = view === "infos";
  const showTeams = view === "teams";
  const showSchedule = view === "schedule";
  const showDashboard = view === "dashboard";
  if (infosPanel) infosPanel.hidden = !showInfos;
  if (teamsPanel) teamsPanel.hidden = !showTeams;
  if (schedulePanel) schedulePanel.hidden = !showSchedule;
  if (dashboardPanel) dashboardPanel.hidden = !showDashboard;
  infosViewBtn?.classList.toggle("is-active", showInfos);
  teamsViewBtn?.classList.toggle("is-active", showTeams);
  scheduleViewBtn?.classList.toggle("is-active", showSchedule);
  dashboardViewBtn?.classList.toggle("is-active", showDashboard);
  infosViewBtn?.setAttribute("aria-expanded", String(showInfos));
  teamsViewBtn?.setAttribute("aria-expanded", String(showTeams));
  scheduleViewBtn?.setAttribute("aria-expanded", String(showSchedule));
  dashboardViewBtn?.setAttribute("aria-expanded", String(showDashboard));
}
infosViewBtn?.addEventListener("click", () => setView("infos"));
teamsViewBtn?.addEventListener("click", () => setView("teams"));
scheduleViewBtn?.addEventListener("click", () => setView("schedule"));
dashboardViewBtn?.addEventListener("click", () => setView("dashboard"));
setView("infos");
