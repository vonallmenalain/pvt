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

const ranglistePublishBtn = document.getElementById("rangliste-publish-btn");
const ranglisteUnpublishBtn = document.getElementById("rangliste-unpublish-btn");
const ranglistePublishedNote = document.getElementById("rangliste-published-note");
const ranglisteViewBtn = document.getElementById("show-rangliste");
const ranglistePanel = document.getElementById("rangliste-panel");
const ranglisteTableBody = document.getElementById("rangliste-table-body");
const ranglisteCategoryFilter = document.getElementById("rangliste-category-filter");

let ranglistePublished = false;
let selectedRanglisteCategory = "adult_ambitious";

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
  { r: "Gruppenspiel", h: 0, a: 1 },
  { r: "Gruppenspiel", h: 2, a: 3 },
  { r: "Gruppenspiel", h: 4, a: 5 },
  { r: "Gruppenspiel", h: 0, a: 2 },
  { r: "Gruppenspiel", h: 1, a: 4 },
  { r: "Gruppenspiel", h: 3, a: 5 },
  { r: "Gruppenspiel", h: 2, a: 4 },
  { r: "Gruppenspiel", h: 0, a: 3 },
  { r: "Gruppenspiel", h: 1, a: 5 },
  { r: "Gruppenspiel", h: 3, a: 4 },
  { r: "Gruppenspiel", h: 1, a: 2 },
  { r: "Gruppenspiel", h: 0, a: 5 },
  { r: "Gruppenspiel", h: 1, a: 3 },
  { r: "Gruppenspiel", h: 0, a: 4 },
  { r: "Gruppenspiel", h: 2, a: 5 },
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
    if (!score || score.home === "" || score.away === "") return;
    const homeScore = Number(score.home);
    const awayScore = Number(score.away);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return;
    if (homeScore < 0 || awayScore < 0) return;
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
      if (ratioB === ratioA) return 0;
      if (ratioB === Infinity) return 1;
      if (ratioA === Infinity) return -1;
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
    return score && score.home !== "" && score.away !== "" &&
      Number.isFinite(Number(score.home)) && Number.isFinite(Number(score.away)) &&
      Number(score.home) >= 0 && Number(score.away) >= 0;
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

  const fp = resolveFinalParticipants(team.category);
  /** Look up a team's ID by name within the category, returning null if not found. */
  const teamIdByName = (name) => teamsInCategory.find((t) => t.name === name)?.id ?? null;

  const allFinals = [
    { id: `final-vfa-${team.category}`, stage: "Viertelfinal A", time: slotTime(15) },
    { id: `final-vfb-${team.category}`, stage: "Viertelfinal B", time: slotTime(16) },
    { id: `final-tq-${team.category}`,  stage: "Top-Quali",      time: slotTime(17) },
    { id: `final-koq-${team.category}`, stage: "K.o.-Quali",     time: slotTime(18) },
    { id: `final-p5-${team.category}`,  stage: "Platz 5",        time: slotTime(19) },
    { id: `final-hf-${team.category}`,  stage: "Halbfinal",      time: slotTime(20) },
    { id: `final-p3-${team.category}`,  stage: "Platz 3",        time: slotTime(21) },
    { id: `final-1-${team.category}`,   stage: "Finale",         time: slotTime(22) },
  ].map(({ id, stage, time }) => {
    const p = fp[id];
    return { id, stage, time, field, home: p.home, homeId: teamIdByName(p.home), away: p.away, awayId: teamIdByName(p.away), editable: p.editable };
  });

  // Only show finals that are relevant for this team
  const teamName = team.name;
  const teamPathFinals = allFinals.filter((finalMatch) => finalMatch.home === teamName || finalMatch.away === teamName);
  const hasCompleteScore = (matchId) => {
    const score = resultMap[matchId];
    if (!score) return false;
    const home = Number(score.home);
    const away = Number(score.away);
    return score.home !== "" && score.away !== "" && Number.isFinite(home) && Number.isFinite(away) && home >= 0 && away >= 0;
  };

  const relevantFinals = [];
  for (const finalMatch of teamPathFinals) {
    // Zeige nur fix zugewiesene Spiele des Teams an
    if (!(finalMatch.home === teamName || finalMatch.away === teamName)) continue;
    const previousVisibleMatch = relevantFinals[relevantFinals.length - 1];
    // Erstes Finalspiel erscheint direkt nach abgeschlossener Gruppenphase (fixe Paarung)
    if (!previousVisibleMatch) {
      relevantFinals.push(finalMatch);
      continue;
    }
    // Nächstes Spiel erst anzeigen, wenn das vorherige Spiel des Teams gespielt wurde
    if (hasCompleteScore(previousVisibleMatch.id)) {
      relevantFinals.push(finalMatch);
    } else {
      break;
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

  const savedFocus = saveFocusedResultInput();
  dashboardMatchTable.innerHTML = matches
    .map((match) => {
      const score = resultMap[match.id] || { home: "", away: "" };
      const hasScore = score.home !== "" && score.away !== "";
      const scoreText = hasScore ? `${escapeHtml(String(score.home))} : ${escapeHtml(String(score.away))}` : "–";
      const readOnly = true;
      const scoreCell = readOnly
        ? `<span class="schedule-result">${scoreText}</span>`
        : `<span class="schedule-result"><input type="number" min="0" class="result-input" data-result-match="${match.id}" data-side="home" value="${escapeHtml(String(score.home))}" /> : <input type="number" min="0" class="result-input" data-result-match="${match.id}" data-side="away" value="${escapeHtml(String(score.away))}" /></span>`;
      const homeCell = match.homeId
        ? `<button type="button" class="team-link" data-team-select="${match.homeId}">${escapeHtml(match.home)}</button>`
        : escapeHtml(match.home);
      const awayCell = match.awayId
        ? `<button type="button" class="team-link" data-team-select="${match.awayId}">${escapeHtml(match.away)}</button>`
        : escapeHtml(match.away);
      return `<tr><td>${match.stage}</td><td class="col-time">${match.time}</td><td>${match.field}</td><td class="col-game"><div class="col-game-inner"><span class="col-game-home">${homeCell}</span><span class="col-game-score">${scoreCell}</span><span class="col-game-away">${awayCell}</span></div></td></tr>`;
    })
    .join("");
  restoreFocusedResultInput(savedFocus);
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
  renderOrganizationPanel();
  renderRangliste();
}

/**
 * Resolve all final-round participants and determine editability for each match.
 * A match becomes editable once both participants are real team names (not placeholders).
 * Later rounds are resolved from the results of earlier finals.
 */
function resolveFinalParticipants(category) {
  const label = CATEGORY_LABELS[category];
  const resolvedMap = resolveFinalNames(category);

  const byRank = (placeholder) => resolvedMap[placeholder] ?? null;
  const r1 = byRank(`${label} Rang 1`);
  const r2 = byRank(`${label} Rang 2`);
  const r3 = byRank(`${label} Rang 3`);
  const r4 = byRank(`${label} Rang 4`);
  const r5 = byRank(`${label} Rang 5`);
  const r6 = byRank(`${label} Rang 6`);

  /** Determine clear winner and loser of a final match from resultMap. Draw = null. */
  const getWinnerLoser = (matchId, homeName, awayName) => {
    if (!homeName || !awayName) return { winner: null, loser: null };
    const score = resultMap[matchId];
    if (!score || score.home === "" || score.away === "") return { winner: null, loser: null };
    const h = Number(score.home), a = Number(score.away);
    if (!Number.isFinite(h) || !Number.isFinite(a) || h < 0 || a < 0) return { winner: null, loser: null };
    if (h > a) return { winner: homeName, loser: awayName };
    if (a > h) return { winner: awayName, loser: homeName };
    return { winner: null, loser: null }; // draw – progression unresolved
  };

  const vfaHome = r3, vfaAway = r6;
  const vfbHome = r4, vfbAway = r5;
  const tqHome = r1, tqAway = r2;

  const { winner: vfaWinner, loser: vfaLoser } = getWinnerLoser(`final-vfa-${category}`, vfaHome, vfaAway);
  const { winner: vfbWinner, loser: vfbLoser } = getWinnerLoser(`final-vfb-${category}`, vfbHome, vfbAway);
  const { winner: tqWinner, loser: tqLoser } = getWinnerLoser(`final-tq-${category}`, tqHome, tqAway);

  const koqHome = vfaWinner, koqAway = vfbWinner;
  const p5Home = vfaLoser, p5Away = vfbLoser;

  const { winner: koqWinner, loser: koqLoser } = getWinnerLoser(`final-koq-${category}`, koqHome, koqAway);

  const hfHome = tqLoser, hfAway = koqWinner;

  const { winner: hfWinner, loser: hfLoser } = getWinnerLoser(`final-hf-${category}`, hfHome, hfAway);

  const p3Home = koqLoser, p3Away = hfLoser;
  const finHome = tqWinner, finAway = hfWinner;

  return {
    [`final-vfa-${category}`]: { home: vfaHome ?? `${label} Rang 3`, away: vfaAway ?? `${label} Rang 6`, editable: !!(vfaHome && vfaAway) },
    [`final-vfb-${category}`]: { home: vfbHome ?? `${label} Rang 4`, away: vfbAway ?? `${label} Rang 5`, editable: !!(vfbHome && vfbAway) },
    [`final-tq-${category}`]:  { home: tqHome  ?? `${label} Rang 1`, away: tqAway  ?? `${label} Rang 2`, editable: !!(tqHome  && tqAway) },
    [`final-koq-${category}`]: { home: koqHome ?? "Sieger Viertelf. A",    away: koqAway ?? "Sieger Viertelf. B",    editable: !!(koqHome && koqAway) },
    [`final-p5-${category}`]:  { home: p5Home  ?? "Verlierer Viertelf. A", away: p5Away  ?? "Verlierer Viertelf. B", editable: !!(p5Home  && p5Away) },
    [`final-hf-${category}`]:  { home: hfHome  ?? "Verlierer Top-Quali",   away: hfAway  ?? "Sieger K.o.-Quali",     editable: !!(hfHome  && hfAway) },
    [`final-p3-${category}`]:  { home: p3Home  ?? "Verlierer K.o.-Quali",  away: p3Away  ?? "Verlierer Halbfinal",   editable: !!(p3Home  && p3Away) },
    [`final-1-${category}`]:   { home: finHome ?? "Sieger Top-Quali",      away: finAway ?? "Sieger Halbfinal",      editable: !!(finHome && finAway) },
  };
}

function getScheduleMatches(teams, category) {
  const field = category === "adult_ambitious" ? "1" : category === "adult_fun" ? "2" : "3";

  if (teams.length < 2) return [];

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
      editable: true,
    };
  }).filter(Boolean);

  const fp = resolveFinalParticipants(category);

  const finalMatchDefs = [
    { id: `final-vfa-${category}`, nr: 16, stage: "Viertelfinal A", time: slotTime(15) },
    { id: `final-vfb-${category}`, nr: 17, stage: "Viertelfinal B", time: slotTime(16) },
    { id: `final-tq-${category}`,  nr: 18, stage: "Top-Quali",      time: slotTime(17) },
    { id: `final-koq-${category}`, nr: 19, stage: "K.o.-Quali",     time: slotTime(18) },
    { id: `final-p5-${category}`,  nr: 20, stage: "Platz 5",        time: slotTime(19) },
    { id: `final-hf-${category}`,  nr: 21, stage: "Halbfinal",      time: slotTime(20) },
    { id: `final-p3-${category}`,  nr: 22, stage: "Platz 3",        time: slotTime(21) },
    { id: `final-1-${category}`,   nr: 23, stage: "Finale",         time: slotTime(22) },
  ];

  const finalMatches = finalMatchDefs.map(({ id, nr, stage, time }) => {
    const p = fp[id];
    return { id, nr, stage, time, field, home: { name: p.home, id: null }, away: { name: p.away, id: null }, editable: p.editable };
  });

  return [...preliminaryMatches, ...finalMatches];
}

/**
 * Returns the focused result-input's identity { matchId, side } so it can be
 * restored after a full DOM re-render, or null if no result-input is focused.
 */
function saveFocusedResultInput() {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement && el.matches(".result-input")) {
    return { matchId: el.dataset.resultMatch, side: el.dataset.side };
  }
  return null;
}

/** Re-focuses the result-input that was active before a re-render, if still present. */
function restoreFocusedResultInput(saved) {
  if (!saved) return;
  const el = document.querySelector(
    `.result-input[data-result-match="${CSS.escape(saved.matchId)}"][data-side="${saved.side}"]`
  );
  if (el instanceof HTMLInputElement) {
    el.focus();
    // Move cursor to end of value
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }
}

function renderSchedule() {
  const tableBody = document.getElementById("schedule-table-body");
  if (!tableBody) return;
  const savedFocus = saveFocusedResultInput();
  const teams = allTeams.filter((team) => team.category === selectedScheduleCategory);
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

    const score = resultMap[match.id] || { home: "", away: "" };
    const hasScore = score.home !== "" && score.away !== "";
    const scoreText = hasScore ? `${escapeHtml(String(score.home))} : ${escapeHtml(String(score.away))}` : "–";
    let resultCell;
    const isFinal = match.id.startsWith("final-");
    if (true) {
      resultCell = `<span class="schedule-result">${scoreText}</span>`;
    } else {
      resultCell = `<span class="schedule-result"><input type="number" min="0" class="result-input" data-result-match="${match.id}" data-side="home" value="${escapeHtml(String(score.home))}" /> : <input type="number" min="0" class="result-input" data-result-match="${match.id}" data-side="away" value="${escapeHtml(String(score.away))}" /></span>`;
    }

    return `<tr><td>${escapeHtml(match.stage)}</td><td class="col-time">${match.time}</td><td>${match.field}</td><td class="col-game"><div class="col-game-inner"><span class="col-game-home">${homeLink}</span><span class="col-game-score">${resultCell}</span><span class="col-game-away">${awayLink}</span></div></td></tr>`;
  }).join("");
  restoreFocusedResultInput(savedFocus);
}


function getCategoryByField(field) {
  if (field === "1") return "adult_ambitious";
  if (field === "2") return "adult_fun";
  return "youth";
}

function renderOrganizationPanel() {
  if (!orgRows) return;
  const slots = [];
  for (let i=0;i<23;i++) {
    const matches = ["1","2","3"].flatMap((field) => {
      const category = getCategoryByField(field);
      const teams = allTeams.filter((team) => team.category === category);
      const list = getScheduleMatches(teams, category);
      const m = list.find((x) => x.nr === i+1);
      return m ? [{...m, field}] : [];
    });
    slots.push({idx:i, time:slotTime(i), matches});
  }
  orgRows.innerHTML = slots.map((slot)=>`<div class="org-row"><button type="button" class="org-toggle" data-org-toggle="${slot.idx}"><span>${slot.time}</span><span>▾</span></button><div class="org-body" id="org-body-${slot.idx}" hidden><div class="org-grid">${slot.matches.length?slot.matches.map((match)=>{const score=resultMap[match.id]||{home:"",away:""};return `<div class="org-match"><span class="org-field">Feld ${match.field}</span><span class="org-team">${escapeHtml(match.home.name)}</span><span><input type="number" min="0" class="result-input org-input" data-result-match="${match.id}" data-side="home" value="${escapeHtml(String(score.home))}"> : <input type="number" min="0" class="result-input org-input" data-result-match="${match.id}" data-side="away" value="${escapeHtml(String(score.away))}"></span><span class="org-team" style="text-align:right;">${escapeHtml(match.away.name)}</span></div>`;}).join(""):'<div>Keine Paarung</div>'}</div></div></div>`).join("");
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const toggle = target.closest("[data-org-toggle]");
  if (!toggle) return;
  const idx = toggle.getAttribute("data-org-toggle");
  const body = document.getElementById(`org-body-${idx}`);
  if (!body) return;
  body.hidden = !body.hidden;
});

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
  if (orgViewBtn) orgViewBtn.hidden = !user;
  if (!user && !orgPanel?.hidden) setView("infos");
  if (!user) closeModal();
  document.querySelectorAll(".team-delete").forEach((button) => { button.hidden = !user; });
  if (selectedTeamId) renderTeamDashboard(selectedTeamId);
  renderSchedule();
  renderOrganizationPanel();
  updateRanglisteVisibility();
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
  renderOrganizationPanel();
});

onSnapshot(collection(db, "resultate"), (snapshot) => {
  resultMap = snapshot.docs.reduce((acc, entry) => ({ ...acc, [entry.id]: entry.data() }), {});
  // Re-render schedule to update results and potentially resolved final names
  renderSchedule();
  renderOrganizationPanel();
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
  if (!target.matches(".result-input.org-input") || !currentUser) return;
  const matchId = target.dataset.resultMatch;
  const side = target.dataset.side;
  if (!matchId || !side) return;
  const next = { ...(resultMap[matchId] || { home: "", away: "" }), [side]: target.value };
  await setDoc(doc(db, "resultate", matchId), next, { merge: true });
});

const infosSubButtons = {
  time_place: document.getElementById("infos-sub-time-place"),
  mode: document.getElementById("infos-sub-mode"),
  rules: document.getElementById("infos-sub-rules"),
};
const infosSubPanels = {
  time_place: document.getElementById("infos-section-time-place"),
  mode: document.getElementById("infos-section-mode"),
  rules: document.getElementById("infos-section-rules"),
};

function setInfosSection(section) {
  Object.entries(infosSubPanels).forEach(([key, panel]) => {
    if (!panel) return;
    panel.hidden = key !== section;
  });
  Object.entries(infosSubButtons).forEach(([key, button]) => {
    if (!button) return;
    const active = key === section;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-expanded", String(active));
  });
}

const infosViewBtn = document.getElementById("show-infos");
const teamsViewBtn = document.getElementById("show-teams");
const scheduleViewBtn = document.getElementById("show-schedule");
const dashboardViewBtn = document.getElementById("show-dashboard");
const infosPanel = document.getElementById("infos-panel");
const teamsPanel = document.getElementById("teams-panel");
const schedulePanel = document.getElementById("schedule-panel");
const orgViewBtn = document.getElementById("show-org");
const orgPanel = document.getElementById("org-panel");
const orgRows = document.getElementById("org-rows");
function setView(view) {
  const showInfos = view === "infos";
  const showTeams = view === "teams";
  const showSchedule = view === "schedule";
  const showDashboard = view === "dashboard";
  const showRangliste = view === "rangliste";
  const showOrg = view === "org";
  if (infosPanel) infosPanel.hidden = !showInfos;
  if (teamsPanel) teamsPanel.hidden = !showTeams;
  if (schedulePanel) schedulePanel.hidden = !showSchedule;
  if (dashboardPanel) dashboardPanel.hidden = !showDashboard;
  if (ranglistePanel) ranglistePanel.hidden = !showRangliste;
  if (orgPanel) orgPanel.hidden = !showOrg;
  infosViewBtn?.classList.toggle("is-active", showInfos);
  teamsViewBtn?.classList.toggle("is-active", showTeams);
  scheduleViewBtn?.classList.toggle("is-active", showSchedule);
  dashboardViewBtn?.classList.toggle("is-active", showDashboard);
  ranglisteViewBtn?.classList.toggle("is-active", showRangliste);
  orgViewBtn?.classList.toggle("is-active", showOrg);
  infosViewBtn?.setAttribute("aria-expanded", String(showInfos));
  teamsViewBtn?.setAttribute("aria-expanded", String(showTeams));
  scheduleViewBtn?.setAttribute("aria-expanded", String(showSchedule));
  dashboardViewBtn?.setAttribute("aria-expanded", String(showDashboard));
  ranglisteViewBtn?.setAttribute("aria-expanded", String(showRangliste));
  orgViewBtn?.setAttribute("aria-expanded", String(showOrg));
  if (showRangliste) renderRangliste();
}
infosViewBtn?.addEventListener("click", () => setView("infos"));
teamsViewBtn?.addEventListener("click", () => setView("teams"));
scheduleViewBtn?.addEventListener("click", () => setView("schedule"));
dashboardViewBtn?.addEventListener("click", () => setView("dashboard"));
ranglisteViewBtn?.addEventListener("click", () => setView("rangliste"));
orgViewBtn?.addEventListener("click", () => setView("org"));
infosSubButtons.time_place?.addEventListener("click", () => setInfosSection("time_place"));
infosSubButtons.mode?.addEventListener("click", () => setInfosSection("mode"));
infosSubButtons.rules?.addEventListener("click", () => setInfosSection("rules"));
setInfosSection("time_place");
setView("infos");

// ── Schlussrangliste ───────────────────────────────────────────────────────

function renderRangliste() {
  if (!ranglisteTableBody) return;
  const teams = allTeams.filter((t) => t.category === selectedRanglisteCategory);
  if (!teams.length) {
    ranglisteTableBody.innerHTML = '<tr><td colspan="7">Noch keine Teams für diese Kategorie erfasst.</td></tr>';
    return;
  }
  const rows = getSortedStandings(teams).map(({ team, pts, gf, ga, played }, idx) => {
    const ratio = ga === 0 ? (gf > 0 ? "∞" : "0") : (gf / ga).toFixed(2);
    return `<tr><td>${idx + 1}</td><td>${escapeHtml(team.name)}</td><td>${played}</td><td>${pts}</td><td>${gf}</td><td>${ga}</td><td>${ratio}</td></tr>`;
  });
  ranglisteTableBody.innerHTML = rows.join("");
}

function updateRanglisteVisibility() {
  const isAuth = Boolean(currentUser);
  // Nav button: always visible to logged-in users; logged-out only if published
  if (ranglisteViewBtn) ranglisteViewBtn.hidden = !(isAuth || ranglistePublished);
  // If we're on the rangliste panel as logged-out and it got un-published, go to infos
  if (!isAuth && !ranglistePublished && ranglistePanel && !ranglistePanel.hidden) setView("infos");
  // Publish/unpublish buttons
  if (ranglistePublishBtn) ranglistePublishBtn.hidden = !(isAuth && !ranglistePublished);
  if (ranglisteUnpublishBtn) ranglisteUnpublishBtn.hidden = !(isAuth && ranglistePublished);
  // Public note
  if (ranglistePublishedNote) ranglistePublishedNote.hidden = !ranglistePublished;
}

ranglisteCategoryFilter?.addEventListener("change", (e) => {
  selectedRanglisteCategory = e.target.value;
  renderRangliste();
});

ranglistePublishBtn?.addEventListener("click", async () => {
  if (!currentUser) return;
  await setDoc(doc(db, "rangliste", "status"), { published: true });
});

ranglisteUnpublishBtn?.addEventListener("click", async () => {
  if (!currentUser) return;
  await setDoc(doc(db, "rangliste", "status"), { published: false });
});

onSnapshot(doc(db, "rangliste", "status"), (snap) => {
  ranglistePublished = snap.exists() ? Boolean(snap.data()?.published) : false;
  updateRanglisteVisibility();
});
