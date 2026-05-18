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
import {
  TOURNAMENT_SCHEDULE,
  SCHEDULE_SLOTS,
  CATEGORY_LABELS,
  CATEGORY_SHORT_LABELS,
  CATEGORY_CODES,
  CODE_TO_CATEGORY,
} from "./tournament-schedule.js";

// ── DOM ──────────────────────────────────────────────────────────────────────
const ranglistePublishBtn = document.getElementById("rangliste-publish-btn");
const ranglisteUnpublishBtn = document.getElementById("rangliste-unpublish-btn");
const ranglistePublishedNote = document.getElementById("rangliste-published-note");
const ranglisteViewBtn = document.getElementById("show-rangliste");
const ranglistePanel = document.getElementById("rangliste-panel");
const ranglisteTableBody = document.getElementById("rangliste-table-body");
const ranglisteCategoryFilter = document.getElementById("rangliste-category-filter");

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
const teamCategorySelect = document.getElementById("team-category");
const teamCodeSelect = document.getElementById("team-code");

const dashboardPanel = document.getElementById("dashboard-panel");
const dashboardTeamSelect = document.getElementById("dashboard-team-select");
const dashboardTitle = document.getElementById("dashboard-team-title");
const dashboardInfo = document.getElementById("dashboard-team-info");
const dashboardGroupTable = document.getElementById("dashboard-group-table");
const dashboardMatchTable = document.getElementById("dashboard-match-table");

const scheduleCategoryFilter = document.getElementById("schedule-category-filter");
const scheduleTeamFilter = document.getElementById("schedule-team-filter");
const scheduleTableBody = document.getElementById("schedule-table-body");

// ── State ────────────────────────────────────────────────────────────────────
let currentUser = null;
let allTeams = [];
let selectedTeamId = null;
let resultMap = {};
let selectedScheduleCategory = "all";
let selectedScheduleTeam = "";
let selectedRanglisteCategory = "adult_ambitious";
let ranglistePublished = false;

// ── Modal Helper ─────────────────────────────────────────────────────────────
function openModal() {
  if (errorEl) errorEl.textContent = "";
  modal.hidden = false;
  refreshTeamCodeOptions();
  form?.teamName?.focus();
}
function closeModal() {
  modal.hidden = true;
  if (errorEl) errorEl.textContent = "";
  form?.reset();
}

// ── Utils ────────────────────────────────────────────────────────────────────
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getMatchOutcomeClass(homeScoreRaw, awayScoreRaw, side) {
  const homeScore = Number(homeScoreRaw);
  const awayScore = Number(awayScoreRaw);
  if (homeScoreRaw === "" || awayScoreRaw === "") return "";
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return "";
  if (homeScore < 0 || awayScore < 0) return "";
  if (homeScore === awayScore) return "is-draw";
  const homeWon = homeScore > awayScore;
  return side === "home" ? (homeWon ? "is-winner" : "is-loser") : (homeWon ? "is-loser" : "is-winner");
}

function hasCompleteScore(matchId) {
  const score = resultMap[matchId];
  if (!score) return false;
  const home = Number(score.home);
  const away = Number(score.away);
  return score.home !== "" && score.away !== "" && Number.isFinite(home) && Number.isFinite(away) && home >= 0 && away >= 0;
}

function getWinnerLoserOf(matchId) {
  const match = TOURNAMENT_SCHEDULE.find((m) => m.id === matchId);
  if (!match) return { winnerCode: null, loserCode: null };
  if (!hasCompleteScore(matchId)) return { winnerCode: null, loserCode: null };
  const score = resultMap[matchId];
  const h = Number(score.home);
  const a = Number(score.away);
  const homeRef = resolveRefCode(match.home, match.category);
  const awayRef = resolveRefCode(match.away, match.category);
  if (!homeRef || !awayRef) return { winnerCode: null, loserCode: null };
  if (h > a) return { winnerCode: homeRef, loserCode: awayRef };
  if (a > h) return { winnerCode: awayRef, loserCode: homeRef };
  return { winnerCode: null, loserCode: null };
}

function allGroupMatchesPlayed(category) {
  const groupMatches = getGroupMatchesForCategory(category);
  return groupMatches.every((m) => hasCompleteScore(m.id));
}

// Liefert für eine Match-Referenz (z.B. { rank: 3 }, { code: "A1" }, { winnerOf: "a-q1" })
// den zugehörigen Team-Code (A1/P3/...) – oder null, falls noch nicht aufgelöst.
// Rang-Referenzen werden erst aufgelöst, wenn alle Gruppenspiele der Kategorie
// gespielt sind, damit Platzierungen final feststehen.
function resolveRefCode(ref, category) {
  if (!ref) return null;
  if (ref.code) return ref.code;
  if (ref.rank) {
    if (!allGroupMatchesPlayed(category)) return null;
    const standings = getSortedStandings(category);
    return standings[ref.rank - 1]?.code ?? null;
  }
  if (ref.winnerOf) return getWinnerLoserOf(ref.winnerOf).winnerCode;
  if (ref.loserOf) return getWinnerLoserOf(ref.loserOf).loserCode;
  return null;
}

// Display-Text einer Match-Referenz (Code → Teamname falls vorhanden, sonst Platzhalter).
function refDisplayName(ref, category) {
  const code = resolveRefCode(ref, category);
  if (code) {
    const team = getTeamByCode(code);
    return team ? team.name : code;
  }
  // Noch nicht aufgelöst → Platzhaltertext
  if (ref.rank) return `Rang ${ref.rank}`;
  if (ref.winnerOf) {
    const m = TOURNAMENT_SCHEDULE.find((x) => x.id === ref.winnerOf);
    return m ? `Sieger ${m.phase}` : "Sieger";
  }
  if (ref.loserOf) {
    const m = TOURNAMENT_SCHEDULE.find((x) => x.id === ref.loserOf);
    return m ? `Verlierer ${m.phase}` : "Verlierer";
  }
  return "–";
}

function refTeamId(ref, category) {
  const code = resolveRefCode(ref, category);
  if (!code) return null;
  return getTeamByCode(code)?.id ?? null;
}

function refTeamCode(ref, category) {
  return resolveRefCode(ref, category);
}

function getTeamByCode(code) {
  if (!code) return null;
  return allTeams.find((t) => t.code === code) || null;
}

function getTeamById(id) {
  return allTeams.find((t) => t.id === id) || null;
}

// Auto-Zuordnung von Spielcodes über das Namens-Schema der Teams in der DB:
//   "Jugendliche 1"  → J1 … "Jugendliche 8"   → J8
//   "Plausch 1"      → P1 … "Plausch 4"       → P4
//   "Ambitioniert 1" → A1 … "Ambitioniert 6"  → A6
// So sind Teams ohne explizit gesetzten Code automatisch an den Spielplan
// gekoppelt. Ein bereits gesetzter Code hat Vorrang; doppelte Codes werden
// nicht überschrieben.
const AUTO_CODE_PATTERNS = [
  { prefix: "J", re: /^Jugendliche\s+(\d+)$/i,  max: 8, category: "youth" },
  { prefix: "P", re: /^Plausch\s+(\d+)$/i,      max: 4, category: "adult_fun" },
  { prefix: "A", re: /^Ambitioniert\s+(\d+)$/i, max: 6, category: "adult_ambitious" },
];

function autoResolveCodeFromName(team) {
  if (!team?.name) return null;
  for (const { prefix, re, max, category } of AUTO_CODE_PATTERNS) {
    if (team.category && team.category !== category) continue;
    const match = team.name.match(re);
    if (!match) continue;
    const num = Number(match[1]);
    if (!Number.isInteger(num) || num < 1 || num > max) continue;
    return `${prefix}${num}`;
  }
  return null;
}

function annotateTeamsWithAutoCodes(teams) {
  const taken = new Set(teams.filter((t) => t.code).map((t) => t.code));
  return teams.map((team) => {
    if (team.code) return team;
    const auto = autoResolveCodeFromName(team);
    if (!auto || taken.has(auto)) return team;
    taken.add(auto);
    return { ...team, code: auto, autoCode: true };
  });
}

// ── Standings (per Kategorie, nur Gruppenspiele) ─────────────────────────────
function getGroupMatchesForCategory(category) {
  return TOURNAMENT_SCHEDULE.filter((m) => m.category === category && m.phaseKind === "group");
}

function calcStatsForCode(code, category) {
  let pts = 0, gf = 0, ga = 0, played = 0;
  const groupMatches = getGroupMatchesForCategory(category);
  for (const match of groupMatches) {
    const homeCode = match.home.code;
    const awayCode = match.away.code;
    const isHome = homeCode === code;
    const isAway = awayCode === code;
    if (!isHome && !isAway) continue;
    if (!hasCompleteScore(match.id)) continue;
    const score = resultMap[match.id];
    const h = Number(score.home);
    const a = Number(score.away);
    played++;
    if (isHome) { gf += h; ga += a; }
    else { gf += a; ga += h; }
    if (h === a) pts += 1;
    else if ((isHome && h > a) || (isAway && a > h)) pts += 2;
  }
  return { pts, gf, ga, played };
}

// Sortiert die Codes einer Kategorie nach: Punkte > Tordifferenz > geschossene Punkte > Code.
// Liefert Array von { code, team, pts, gf, ga, played }.
function getSortedStandings(category) {
  const codes = CATEGORY_CODES[category] || [];
  return codes
    .map((code) => ({ code, team: getTeamByCode(code), ...calcStatsForCode(code, category) }))
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const diffA = a.gf - a.ga;
      const diffB = b.gf - b.ga;
      if (diffB !== diffA) return diffB - diffA;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.code.localeCompare(b.code);
    });
}

function ratioText(gf, ga) {
  if (ga === 0) return gf > 0 ? "∞" : "0";
  return (gf / ga).toFixed(2);
}

// ── Team-Auswahl im Dropdown beim Team-Erfassen ──────────────────────────────
function refreshTeamCodeOptions() {
  if (!teamCodeSelect || !teamCategorySelect) return;
  const category = teamCategorySelect.value;
  const codes = CATEGORY_CODES[category] || [];
  const takenCodes = new Set(
    allTeams.filter((t) => t.category === category && t.code).map((t) => t.code)
  );
  const html = ['<option value="">– kein Code –</option>'];
  for (const code of codes) {
    const taken = takenCodes.has(code);
    html.push(`<option value="${code}"${taken ? " disabled" : ""}>${code}${taken ? " (vergeben)" : ""}</option>`);
  }
  teamCodeSelect.innerHTML = html.join("");
}

teamCategorySelect?.addEventListener("change", () => refreshTeamCodeOptions());

// ── Spielplan-Rendering ──────────────────────────────────────────────────────
function phaseChipHtml(match) {
  const kind = match.phaseKind;
  if (kind === "group") return "";
  return `<span class="phase-chip phase-${kind}">${escapeHtml(match.phase)}</span>`;
}

function categoryChipHtml(category, { clickable = true } = {}) {
  const label = CATEGORY_SHORT_LABELS[category] || category;
  if (!clickable) {
    return `<span class="cat-chip cat-${category}">${escapeHtml(label)}</span>`;
  }
  return `<button type="button" class="cat-chip cat-chip-clickable cat-${category}" data-category-filter="${category}" title="Spielplan auf ${escapeHtml(label)} filtern">${escapeHtml(label)}</button>`;
}

function teamCellHtml(ref, category, matchId, side) {
  const teamId = refTeamId(ref, category);
  const displayName = refDisplayName(ref, category);
  const code = refTeamCode(ref, category);
  const score = resultMap[matchId] || { home: "", away: "" };
  const outcome = getMatchOutcomeClass(score.home, score.away, side);
  const isPlaceholder = !teamId && !code;
  if (teamId) {
    return `<button type="button" class="team-link ${outcome}" data-team-select="${teamId}">${escapeHtml(displayName)}</button>`;
  }
  return `<span class="team-placeholder${isPlaceholder ? " is-dynamic" : ""}">${escapeHtml(displayName)}</span>`;
}

function rowClassForPhase(kind) {
  return kind === "group" ? "" : `row-phase-${kind}`;
}

function scoreCellHtml(match) {
  const score = resultMap[match.id] || { home: "", away: "" };
  if (hasCompleteScore(match.id)) {
    return `<span class="schedule-result">${escapeHtml(String(score.home))} : ${escapeHtml(String(score.away))}</span>`;
  }
  return `<span class="schedule-result schedule-result-empty">–</span>`;
}

function scheduleMatchesFiltered() {
  let list = TOURNAMENT_SCHEDULE.slice();
  if (selectedScheduleCategory !== "all") {
    list = list.filter((m) => m.category === selectedScheduleCategory);
  }
  if (selectedScheduleTeam) {
    const team = getTeamById(selectedScheduleTeam);
    const code = team?.code;
    if (code) {
      list = list.filter((m) => {
        const hc = refTeamCode(m.home, m.category);
        const ac = refTeamCode(m.away, m.category);
        return hc === code || ac === code;
      });
    } else if (team) {
      list = list.filter((m) => {
        const hid = refTeamId(m.home, m.category);
        const aid = refTeamId(m.away, m.category);
        return hid === team.id || aid === team.id;
      });
    }
  }
  // Sort by time, then field
  return list.sort((a, b) => {
    if (a.time !== b.time) return a.time.localeCompare(b.time);
    return a.field.localeCompare(b.field);
  });
}

function renderSchedule() {
  if (!scheduleTableBody) return;
  refreshScheduleTeamOptions();
  const matches = scheduleMatchesFiltered();
  if (!matches.length) {
    scheduleTableBody.innerHTML = '<tr><td colspan="6">Keine Spiele für die gewählten Filter.</td></tr>';
    return;
  }
  scheduleTableBody.innerHTML = matches.map((match) => {
    const rowCls = rowClassForPhase(match.phaseKind);
    const phaseBadge = phaseChipHtml(match);
    const catBadge = categoryChipHtml(match.category);
    const homeCell = teamCellHtml(match.home, match.category, match.id, "home");
    const awayCell = teamCellHtml(match.away, match.category, match.id, "away");
    const scoreCell = scoreCellHtml(match);
    const timeCell = `<span class="time-start">${match.time}</span><span class="time-range"> – ${match.endTime}</span>`;
    return `<tr class="${rowCls}">
      <td class="col-time">${timeCell}</td>
      <td class="col-field">Feld ${match.field}</td>
      <td class="col-category">${catBadge}${phaseBadge ? " " + phaseBadge : ""}</td>
      <td class="col-game">
        <div class="col-game-inner">
          <span class="col-game-home">${homeCell}</span>
          <span class="col-game-score">${scoreCell}</span>
          <span class="col-game-away">${awayCell}</span>
        </div>
      </td>
    </tr>`;
  }).join("");
}

function refreshScheduleTeamOptions() {
  if (!scheduleTeamFilter) return;
  const cat = selectedScheduleCategory;
  const teams = allTeams.filter((t) => cat === "all" || t.category === cat);
  // Aktuelle Auswahl ggf. löschen, falls Kategorie gewechselt wird
  const currentValid = teams.some((t) => t.id === selectedScheduleTeam);
  if (!currentValid) selectedScheduleTeam = "";
  const sorted = teams.slice().sort((a, b) => a.name.localeCompare(b.name, "de"));
  const opts = ['<option value="">Alle Teams</option>']
    .concat(sorted.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`));
  scheduleTeamFilter.innerHTML = opts.join("");
  scheduleTeamFilter.value = selectedScheduleTeam;
}

scheduleCategoryFilter?.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  selectedScheduleCategory = target.value;
  renderSchedule();
});

scheduleTeamFilter?.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  selectedScheduleTeam = target.value;
  renderSchedule();
});

// ── Teams-Tab ────────────────────────────────────────────────────────────────
function renderTeamCard(team) {
  const canDelete = Boolean(currentUser);
  return `<li class="team-card" data-team-select="${team.id}">
    <div class="team-card-content">
      <p class="team-name">${escapeHtml(team.name)}</p>
      <p class="team-meta">Gemeinde: ${escapeHtml(team.community)}</p>
      <p class="team-meta">Mannschaftsverantwortlich: ${escapeHtml(team.manager)}</p>
    </div>
    ${canDelete ? `<button type="button" class="team-delete" data-team-id="${team.id}">Löschen</button>` : ""}
  </li>`;
}

function renderTeams(teams) {
  const byCategory = { youth: [], adult_fun: [], adult_ambitious: [] };
  teams.forEach((team) => { if (byCategory[team.category]) byCategory[team.category].push(team); });
  Object.entries(teamLists).forEach(([category, listEl]) => {
    if (!listEl) return;
    const entries = byCategory[category];
    // Sort by code if present, otherwise name
    entries.sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, "de"));
    listEl.innerHTML = entries.length
      ? entries.map((team) => renderTeamCard(team)).join("")
      : '<li class="team-empty">Noch keine Teams erfasst.</li>';
  });
  renderDashboardTeamOptions();
  if (selectedTeamId) renderTeamDashboard(selectedTeamId); else renderDashboardEmptyState();
  renderSchedule();
  renderOrganizationPanel();
  renderRangliste();
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboardEmptyState() {
  if (!dashboardTitle || !dashboardInfo || !dashboardGroupTable || !dashboardMatchTable) return;
  dashboardTitle.textContent = "Team-Dashboard";
  dashboardInfo.textContent = "Wähle ein Team aus, um Spiele und Tabelle zu sehen.";
  dashboardGroupTable.innerHTML = '<tr><td colspan="7">Noch kein Team ausgewählt.</td></tr>';
  dashboardMatchTable.innerHTML = '<tr><td colspan="4">Noch kein Team ausgewählt.</td></tr>';
}

function renderGroupStandings(category, selectedCode) {
  if (!dashboardGroupTable) return;
  const rows = getSortedStandings(category)
    .map(({ code, team, pts, gf, ga, played }, idx) => {
      const rowClass = code === selectedCode ? ' class="is-selected-row"' : "";
      const nameCell = team
        ? `<button type="button" class="team-link" data-team-select="${team.id}">${escapeHtml(team.name)}</button>`
        : `<span class="team-placeholder">–</span>`;
      return `<tr${rowClass}><td>${idx + 1}</td><td>${nameCell}</td><td>${played}</td><td>${pts}</td><td>${gf}</td><td>${ga}</td><td>${ratioText(gf, ga)}</td></tr>`;
    });
  dashboardGroupTable.innerHTML = rows.join("");
}

function getMatchesForTeam(team) {
  if (!team || !team.code) return [];
  const code = team.code;
  const category = team.category;
  const teamMatches = [];

  // 1. Gruppenspiele: direkte Code-Matches
  for (const match of TOURNAMENT_SCHEDULE.filter((m) => m.category === category && m.phaseKind === "group")) {
    if (match.home.code === code || match.away.code === code) {
      teamMatches.push(match);
    }
  }

  // 2. Finals/Playoffs: aufgelöste Codes
  const playoffMatches = TOURNAMENT_SCHEDULE.filter((m) => m.category === category && m.phaseKind !== "group");

  // Reveal-Logic: zeige nur Playoff-Spiele, die für dieses Team relevant sind,
  // und sukzessive (sobald das vorherige Spiel des Teams ein Resultat hat).
  const sortedPlayoffs = playoffMatches.slice().sort((a, b) => a.time.localeCompare(b.time));
  let previousVisibleId = teamMatches.length ? teamMatches[teamMatches.length - 1].id : null;
  for (const m of sortedPlayoffs) {
    const homeCode = refTeamCode(m.home, m.category);
    const awayCode = refTeamCode(m.away, m.category);
    const isMine = homeCode === code || awayCode === code;
    if (!isMine) continue;
    // Erstes Playoff direkt nach Gruppenphase, sobald aufgelöst → anzeigen
    if (!previousVisibleId || hasCompleteScore(previousVisibleId)) {
      teamMatches.push(m);
      previousVisibleId = m.id;
    } else {
      break;
    }
  }
  return teamMatches.sort((a, b) => a.time.localeCompare(b.time));
}

function renderTeamDashboard(teamId) {
  const selectedTeam = allTeams.find((t) => t.id === teamId);
  if (!selectedTeam) {
    selectedTeamId = null;
    if (dashboardTeamSelect) dashboardTeamSelect.value = "";
    renderDashboardEmptyState();
    return;
  }
  selectedTeamId = teamId;
  if (dashboardTeamSelect) dashboardTeamSelect.value = selectedTeamId;

  const category = selectedTeam.category;
  const code = selectedTeam.code || null;

  dashboardTitle.textContent = selectedTeam.name;
  dashboardInfo.textContent = CATEGORY_LABELS[category];

  renderGroupStandings(category, code);

  const matches = getMatchesForTeam(selectedTeam);
  if (!matches.length) {
    if (!code) {
      dashboardMatchTable.innerHTML = '<tr><td colspan="4">Diesem Team ist noch kein Spielcode zugewiesen.</td></tr>';
    } else {
      dashboardMatchTable.innerHTML = '<tr><td colspan="4">Keine Spiele gefunden.</td></tr>';
    }
    return;
  }

  dashboardMatchTable.innerHTML = matches.map((match) => {
    const homeCell = teamCellHtml(match.home, match.category, match.id, "home");
    const awayCell = teamCellHtml(match.away, match.category, match.id, "away");
    const scoreCell = scoreCellHtml(match);
    const phaseLabel = match.phase;
    return `<tr><td>${escapeHtml(phaseLabel)}</td><td class="col-time">${match.time}</td><td>Feld ${match.field}</td><td class="col-game"><div class="col-game-inner"><span class="col-game-home">${homeCell}</span><span class="col-game-score">${scoreCell}</span><span class="col-game-away">${awayCell}</span></div></td></tr>`;
  }).join("");
}

function renderDashboardTeamOptions() {
  if (!dashboardTeamSelect) return;
  const options = allTeams
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .map((team) => {
      return `<option value="${team.id}">${escapeHtml(team.name)} (${CATEGORY_SHORT_LABELS[team.category]})</option>`;
    }).join("");
  dashboardTeamSelect.innerHTML = `<option value="">Bitte Team auswählen</option>${options}`;
  dashboardTeamSelect.value = selectedTeamId || "";
}

// ── Turnierorganisation ─────────────────────────────────────────────────────
const orgRows = document.getElementById("org-rows");

function renderOrganizationPanel() {
  if (!orgRows) return;
  // Group matches by time slot
  const slots = SCHEDULE_SLOTS.map((time) => {
    const matches = TOURNAMENT_SCHEDULE
      .filter((m) => m.time === time)
      .sort((a, b) => a.field.localeCompare(b.field));
    return { time, matches };
  });

  orgRows.innerHTML = slots.map((slot, idx) => {
    const inner = slot.matches.map((match) => {
      const score = resultMap[match.id] || { home: "", away: "" };
      const homeName = refDisplayName(match.home, match.category);
      const awayName = refDisplayName(match.away, match.category);
      const homeCode = refTeamCode(match.home, match.category);
      const awayCode = refTeamCode(match.away, match.category);
      const hasBoth = homeCode && awayCode;
      const phaseInfo = match.phaseKind === "group" ? "" : ` <em class="org-phase">(${escapeHtml(match.phase)})</em>`;
      const inputs = hasBoth
        ? `<input type="number" min="0" class="result-input org-input" data-result-match="${match.id}" data-side="home" value="${escapeHtml(String(score.home))}"> : <input type="number" min="0" class="result-input org-input" data-result-match="${match.id}" data-side="away" value="${escapeHtml(String(score.away))}">`
        : `<span class="org-pending">noch nicht aufgelöst</span>`;
      return `<div class="org-match">
        <span class="org-field">Feld ${match.field}</span>
        <span class="org-cat">${categoryChipHtml(match.category)}</span>
        <span class="org-team">${escapeHtml(homeName)}</span>
        <span class="org-score">${inputs}</span>
        <span class="org-team org-team-away">${escapeHtml(awayName)}</span>
        ${phaseInfo}
      </div>`;
    }).join("");
    return `<div class="org-row"><button type="button" class="org-toggle" data-org-toggle="${idx}"><span>${slot.time}</span><span>▾</span></button><div class="org-body" id="org-body-${idx}" hidden><div class="org-grid">${inner || '<div>Keine Paarung</div>'}</div></div></div>`;
  }).join("");
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

// ── Buttons / Forms ──────────────────────────────────────────────────────────
createButton?.addEventListener("click", () => openModal());
cancelBtn?.addEventListener("click", () => closeModal());

dashboardTeamSelect?.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  renderTeamDashboard(target.value);
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const name = form.teamName.value.trim();
  const community = form.community.value.trim();
  const manager = form.manager.value.trim();
  const category = form.category.value;
  const code = teamCodeSelect?.value?.trim() || "";
  if (!name || !community || !manager || !category) {
    if (errorEl) errorEl.textContent = "Bitte alle Pflichtfelder ausfüllen.";
    return;
  }
  if (code && CODE_TO_CATEGORY[code] !== category) {
    if (errorEl) errorEl.textContent = "Spielcode passt nicht zur Kategorie.";
    return;
  }
  if (code && allTeams.some((t) => t.code === code)) {
    if (errorEl) errorEl.textContent = "Dieser Spielcode ist bereits vergeben.";
    return;
  }
  const payload = {
    name, community, manager, category,
    code: code || null,
    createdAt: serverTimestamp(),
    ownerUid: currentUser.uid,
  };
  try {
    await addDoc(collection(db, "teams"), payload);
    closeModal();
  } catch {
    if (errorEl) errorEl.textContent = "Team konnte nicht gespeichert werden.";
  }
});

// ── Firebase Auth + Snapshots ────────────────────────────────────────────────
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
  const rawTeams = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  allTeams = annotateTeamsWithAutoCodes(rawTeams);
  renderTeams(allTeams);
});

onSnapshot(collection(db, "resultate"), (snapshot) => {
  resultMap = snapshot.docs.reduce((acc, entry) => ({ ...acc, [entry.id]: entry.data() }), {});
  renderSchedule();
  renderOrganizationPanel();
  if (selectedTeamId) renderTeamDashboard(selectedTeamId);
  renderRangliste();
});

// ── Team-Klicks (Dashboard-Sprung) + Löschen ─────────────────────────────────
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

// ── Kategorie-Klicks (Spielplan filtern) ─────────────────────────────────────
// Klick auf einen Kategorie-Chip (z.B. "Ambitioniert") öffnet den Spielplan
// und filtert sofort auf die angeklickte Kategorie.
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const chip = target.closest("[data-category-filter]");
  if (!chip) return;
  event.preventDefault();
  const category = chip.getAttribute("data-category-filter");
  if (!category) return;
  selectedScheduleCategory = category;
  selectedScheduleTeam = "";
  if (scheduleCategoryFilter) scheduleCategoryFilter.value = category;
  if (scheduleTeamFilter) scheduleTeamFilter.value = "";
  setView("schedule");
  renderSchedule();
});

// ── Ergebniseingabe (nur Org-Panel) ─────────────────────────────────────────
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

// ── Infos-Subnav ────────────────────────────────────────────────────────────
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

function setInfosSection(section, { updateHash = true } = {}) {
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
  currentInfosSection = section;
  if (updateHash && currentView === "infos") syncLocationHash();
}

// ── View-Navigation ─────────────────────────────────────────────────────────
const infosViewBtn = document.getElementById("show-infos");
const teamsViewBtn = document.getElementById("show-teams");
const scheduleViewBtn = document.getElementById("show-schedule");
const dashboardViewBtn = document.getElementById("show-dashboard");
const infosPanel = document.getElementById("infos-panel");
const teamsPanel = document.getElementById("teams-panel");
const schedulePanel = document.getElementById("schedule-panel");
const orgViewBtn = document.getElementById("show-org");
const orgPanel = document.getElementById("org-panel");

const VALID_VIEWS = ["infos", "teams", "schedule", "dashboard", "rangliste", "org"];
const VALID_INFOS_SECTIONS = ["time_place", "mode", "rules"];
let currentView = "infos";
let currentInfosSection = "time_place";

function buildHash(view, infosSection) {
  if (view === "infos") return `#infos/${infosSection}`;
  return `#${view}`;
}

function syncLocationHash() {
  const target = buildHash(currentView, currentInfosSection);
  if (location.hash !== target) {
    history.pushState({ view: currentView, infosSection: currentInfosSection }, "", target);
  } else {
    history.replaceState({ view: currentView, infosSection: currentInfosSection }, "");
  }
}

function parseHash() {
  const raw = location.hash.replace(/^#/, "");
  if (!raw) return { view: "infos", infosSection: "time_place" };
  const [viewPart, sectionPart] = raw.split("/");
  const view = VALID_VIEWS.includes(viewPart) ? viewPart : "infos";
  const infosSection = VALID_INFOS_SECTIONS.includes(sectionPart) ? sectionPart : "time_place";
  return { view, infosSection };
}

function setView(view, { updateHash = true } = {}) {
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
  if (showSchedule) renderSchedule();
  currentView = view;
  if (updateHash) syncLocationHash();
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

function isViewAccessible(view) {
  if (view === "org") return Boolean(currentUser);
  if (view === "rangliste") return Boolean(currentUser) || ranglistePublished;
  return true;
}

window.addEventListener("popstate", (event) => {
  const fromState = event.state && typeof event.state === "object"
    ? { view: event.state.view, infosSection: event.state.infosSection }
    : null;
  const parsed = fromState && VALID_VIEWS.includes(fromState.view)
    ? {
        view: fromState.view,
        infosSection: VALID_INFOS_SECTIONS.includes(fromState.infosSection)
          ? fromState.infosSection
          : currentInfosSection,
      }
    : parseHash();
  const targetView = isViewAccessible(parsed.view) ? parsed.view : "infos";
  setInfosSection(parsed.infosSection, { updateHash: false });
  setView(targetView, { updateHash: false });
  if (targetView !== parsed.view) syncLocationHash();
});

const initial = parseHash();
setInfosSection(initial.infosSection, { updateHash: false });
setView(initial.view, { updateHash: false });
history.replaceState(
  { view: currentView, infosSection: currentInfosSection },
  "",
  buildHash(currentView, currentInfosSection),
);

// ── Schlussrangliste ────────────────────────────────────────────────────────
function renderRangliste() {
  if (!ranglisteTableBody) return;
  const codes = CATEGORY_CODES[selectedRanglisteCategory] || [];
  if (!codes.length) {
    ranglisteTableBody.innerHTML = '<tr><td colspan="7">Keine Daten verfügbar.</td></tr>';
    return;
  }
  const rows = getSortedStandings(selectedRanglisteCategory).map(({ code, team, pts, gf, ga, played }, idx) => {
    const teamLabel = team ? escapeHtml(team.name) : `<span class="team-placeholder">–</span>`;
    return `<tr><td>${idx + 1}</td><td>${teamLabel}</td><td>${played}</td><td>${pts}</td><td>${gf}</td><td>${ga}</td><td>${ratioText(gf, ga)}</td></tr>`;
  });
  ranglisteTableBody.innerHTML = rows.join("");
}

function updateRanglisteVisibility() {
  const isAuth = Boolean(currentUser);
  if (ranglisteViewBtn) ranglisteViewBtn.hidden = !(isAuth || ranglistePublished);
  if (!isAuth && !ranglistePublished && ranglistePanel && !ranglistePanel.hidden) setView("infos");
  if (ranglistePublishBtn) ranglistePublishBtn.hidden = !(isAuth && !ranglistePublished);
  if (ranglisteUnpublishBtn) ranglisteUnpublishBtn.hidden = !(isAuth && ranglistePublished);
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

// Initial render
renderSchedule();
renderOrganizationPanel();
renderRangliste();
