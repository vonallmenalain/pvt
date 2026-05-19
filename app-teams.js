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
  CATEGORY_PREFIX,
  CODE_TO_CATEGORY,
} from "./tournament-schedule.js";

// ── DOM ──────────────────────────────────────────────────────────────────────
const ranglistePublishBtn = document.getElementById("rangliste-publish-btn");
const ranglisteUnpublishBtn = document.getElementById("rangliste-unpublish-btn");
const ranglistePublishedNote = document.getElementById("rangliste-published-note");
const ranglisteViewBtn = document.getElementById("show-rangliste");
const ranglistePanel = document.getElementById("rangliste-panel");
const ranglisteTableBody = document.getElementById("rangliste-table-body");
const ranglisteFinalList = document.getElementById("rangliste-final-list");
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

const scheduleCategoryTiles = document.querySelectorAll(".schedule-category-tiles .cat-tile");
const scheduleTableBody = document.getElementById("schedule-table-body");
const scheduleStandingsWrap = document.getElementById("schedule-standings");
const scheduleStandingsToggle = document.getElementById("schedule-standings-toggle");
const scheduleStandingsBody = document.getElementById("schedule-standings-body");
const scheduleStandingsTable = document.getElementById("schedule-standings-table");

// ── State ────────────────────────────────────────────────────────────────────
let currentUser = null;
let allTeams = [];
let selectedTeamId = null;
let resultMap = {};
let selectedScheduleCategory = "all";
let selectedRanglisteCategory = "adult_ambitious";
let ranglistePublished = false;
// Gruppentabelle im Spielplan ist standardmässig eingeklappt. Der Zustand
// bleibt über Kategorie-Wechsel hinweg erhalten, damit Nutzer:innen die
// Tabelle nicht bei jedem Wechsel erneut aufklappen müssen.
let scheduleStandingsOpen = false;

// ── Focus-Preservation für Result-Inputs ────────────────────────────────────
// Beim Speichern eines Punktestands triggert Firestore via onSnapshot ein
// Re-Render der Spielplan- und Org-Tabellen. Ohne Schutz löscht das via
// innerHTML den gerade aktiven Input (z.B. nach Tab) und zerstört damit den
// Eingabefokus. Wir speichern daher Match-ID, Seite, Caret-Position und
// (optional) den noch nicht abgespeicherten Wert vor jedem Re-Render und
// stellen den Fokus danach wieder her.
function captureResultInputFocus() {
  const active = document.activeElement;
  if (!active || !(active instanceof HTMLInputElement)) return null;
  if (!active.matches(".result-input[data-result-match]")) return null;
  const panel = active.closest("#org-panel, #schedule-panel, #dashboard-panel");
  return {
    matchId: active.dataset.resultMatch,
    side: active.dataset.side,
    selectionStart: active.selectionStart,
    selectionEnd: active.selectionEnd,
    pendingValue: active.value,
    panelId: panel?.id || null,
  };
}

function restoreResultInputFocus(focus) {
  if (!focus) return;
  const root = focus.panelId ? document.getElementById(focus.panelId) : document;
  if (!root) return;
  const escMatch = (window.CSS && CSS.escape) ? CSS.escape(focus.matchId) : focus.matchId;
  const next = root.querySelector(
    `.result-input[data-result-match="${escMatch}"][data-side="${focus.side}"]`
  );
  if (!next) return;
  // Wenn der Nutzer nach Tab bereits Zeichen ins neue Feld getippt hat, ist
  // dieser Wert noch nicht in resultMap — beim Re-Render würde der frische
  // Wert verloren gehen. Wir übernehmen ihn daher zurück, sofern er vom neu
  // gerenderten Wert abweicht.
  if (typeof focus.pendingValue === "string" && focus.pendingValue !== next.value) {
    next.value = focus.pendingValue;
  }
  next.focus();
  try {
    const start = focus.selectionStart ?? next.value.length;
    const end = focus.selectionEnd ?? next.value.length;
    next.setSelectionRange(start, end);
  } catch (_) {
    // Manche Browser werfen bei type=number auf setSelectionRange — ignorieren.
  }
}

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

// ── Schlussrangliste (Gruppe + Finalspiele) ─────────────────────────────────
// Beschreibt, welche Finalspiel-Resultate welchen Schluss-Rang bestimmen.
// Ränge, die hier nicht aufgeführt sind (z.B. Jugend 5–8), werden aus der
// Gruppenphase übernommen.
const FINAL_RANK_RULES = {
  adult_ambitious: [
    { rank: 1, kind: "winner", matchId: "a-fin" },
    { rank: 2, kind: "loser",  matchId: "a-fin" },
    { rank: 3, kind: "winner", matchId: "a-p3"  },
    { rank: 4, kind: "loser",  matchId: "a-p3"  },
    { rank: 5, kind: "winner", matchId: "a-p5"  },
    { rank: 6, kind: "loser",  matchId: "a-p5"  },
  ],
  adult_fun: [
    { rank: 1, kind: "winner", matchId: "p-fin" },
    { rank: 2, kind: "loser",  matchId: "p-fin" },
    { rank: 3, kind: "winner", matchId: "p-p3"  },
    { rank: 4, kind: "loser",  matchId: "p-p3"  },
  ],
  youth: [
    { rank: 1, kind: "winner", matchId: "j-fin" },
    { rank: 2, kind: "loser",  matchId: "j-fin" },
    { rank: 3, kind: "winner", matchId: "j-p3"  },
    { rank: 4, kind: "loser",  matchId: "j-p3"  },
    { rank: 5, kind: "winner", matchId: "j-p5"  },
    { rank: 6, kind: "loser",  matchId: "j-p5"  },
    { rank: 7, kind: "winner", matchId: "j-p7"  },
    { rank: 8, kind: "loser",  matchId: "j-p7"  },
  ],
};

// Liefert die Schlussrangliste einer Kategorie als Array von
// { rank, code, team, pts, gf, ga, played, definitive }.
//
// Ein Rang gilt als `definitive`, sobald sein endgültiger Platz feststeht:
//   - Wird er durch ein Finalspiel bestimmt (FINAL_RANK_RULES), muss dieses
//     Spiel ein vollständiges Resultat haben.
//   - Wird er nicht durch ein Finalspiel bestimmt (z.B. Jugend Platz 5–8),
//     muss die Gruppenphase der Kategorie komplett gespielt sein.
//
// Nicht-definitive Ränge bleiben in der Schlussrangliste leer (code/team =
// null), so dass die Ansicht nichts Vorläufiges als „endgültig" suggeriert.
function getFinalRanking(category) {
  const groupStandings = getSortedStandings(category);
  const total = groupStandings.length;
  const rules = FINAL_RANK_RULES[category] || [];
  const groupComplete = allGroupMatchesPlayed(category);

  const ruleByRank = new Map();
  for (const rule of rules) ruleByRank.set(rule.rank, rule);

  const result = [];
  for (let i = 0; i < total; i++) {
    const rank = i + 1;
    const rule = ruleByRank.get(rank);
    let code = null;
    let definitive = false;

    if (rule) {
      const { winnerCode, loserCode } = getWinnerLoserOf(rule.matchId);
      const candidate = rule.kind === "winner" ? winnerCode : loserCode;
      if (candidate) {
        code = candidate;
        definitive = true;
      }
    } else if (groupComplete) {
      code = groupStandings[i]?.code ?? null;
      definitive = code != null;
    }

    const statsByCode = code
      ? groupStandings.find((s) => s.code === code)
      : null;

    result.push({
      rank,
      code,
      team: statsByCode?.team ?? (code ? getTeamByCode(code) : null),
      pts: statsByCode?.pts ?? 0,
      gf: statsByCode?.gf ?? 0,
      ga: statsByCode?.ga ?? 0,
      played: statsByCode?.played ?? 0,
      definitive,
    });
  }

  return result;
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
// Phasenbezeichnung im Spielplan inkl. Kategorie-Kürzel (A/P/J),
// z.B. "A - RoundRobin", "P - Halbfinal 1", "J - Finale".
function phaseLabelWithPrefix(match) {
  const prefix = CATEGORY_PREFIX[match.category];
  return prefix ? `${prefix} - ${match.phase}` : match.phase;
}

function phaseChipHtml(match) {
  const kind = match.phaseKind;
  return `<span class="phase-chip phase-${kind}">${escapeHtml(phaseLabelWithPrefix(match))}</span>`;
}

function categoryChipHtml(category, { clickable = true } = {}) {
  const label = CATEGORY_SHORT_LABELS[category] || category;
  if (!clickable) {
    return `<span class="cat-chip cat-${category}">${escapeHtml(label)}</span>`;
  }
  return `<button type="button" class="cat-chip cat-chip-clickable cat-${category}" data-category-filter="${category}" title="Spielplan auf ${escapeHtml(label)} filtern">${escapeHtml(label)}</button>`;
}

function rowClassForCategory(category) {
  return `row-cat-${category}`;
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


function scoreCellHtml(match, { editable = false } = {}) {
  const score = resultMap[match.id] || { home: "", away: "" };
  if (editable) {
    const homeCode = refTeamCode(match.home, match.category);
    const awayCode = refTeamCode(match.away, match.category);
    if (homeCode && awayCode) {
      return `<span class="schedule-result schedule-result-editable">`
        + `<input type="number" min="0" class="result-input" data-result-match="${match.id}" data-side="home" value="${escapeHtml(String(score.home))}" aria-label="Punkte Heim">`
        + ` : `
        + `<input type="number" min="0" class="result-input" data-result-match="${match.id}" data-side="away" value="${escapeHtml(String(score.away))}" aria-label="Punkte Gast">`
        + `</span>`;
    }
  }
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
  // Sort by time, then field
  return list.sort((a, b) => {
    if (a.time !== b.time) return a.time.localeCompare(b.time);
    return a.field.localeCompare(b.field);
  });
}

function renderScheduleStandings() {
  if (!scheduleStandingsWrap) return;
  const showStandings =
    selectedScheduleCategory !== "all" &&
    (CATEGORY_CODES[selectedScheduleCategory] || []).length > 0;
  scheduleStandingsWrap.hidden = !showStandings;
  if (!showStandings) return;

  if (scheduleStandingsBody) scheduleStandingsBody.hidden = !scheduleStandingsOpen;
  if (scheduleStandingsToggle) {
    scheduleStandingsToggle.setAttribute("aria-expanded", String(scheduleStandingsOpen));
    scheduleStandingsToggle.classList.toggle("is-open", scheduleStandingsOpen);
  }

  if (!scheduleStandingsTable) return;
  const standings = getSortedStandings(selectedScheduleCategory);
  if (!standings.length) {
    scheduleStandingsTable.innerHTML = '<tr><td colspan="7">Noch keine Teams erfasst.</td></tr>';
    return;
  }
  scheduleStandingsTable.innerHTML = standings
    .map(({ code, team, pts, gf, ga, played }, idx) => {
      const nameCell = team
        ? `<button type="button" class="team-link" data-team-select="${team.id}">${escapeHtml(team.name)}</button>`
        : (code ? escapeHtml(code) : `<span class="team-placeholder">–</span>`);
      return `<tr><td>${idx + 1}</td><td>${nameCell}</td><td>${played}</td><td>${pts}</td><td>${gf}</td><td>${ga}</td><td>${ratioText(gf, ga)}</td></tr>`;
    })
    .join("");
}

function renderSchedule() {
  renderScheduleStandings();
  if (!scheduleTableBody) return;
  const focus = captureResultInputFocus();
  const matches = scheduleMatchesFiltered();
  if (!matches.length) {
    scheduleTableBody.innerHTML = '<tr><td colspan="4">Keine Spiele für die gewählten Filter.</td></tr>';
    restoreResultInputFocus(focus);
    return;
  }
  scheduleTableBody.innerHTML = matches.map((match) => {
    const rowCls = rowClassForCategory(match.category);
    const phaseBadge = phaseChipHtml(match);
    const homeCell = teamCellHtml(match.home, match.category, match.id, "home");
    const awayCell = teamCellHtml(match.away, match.category, match.id, "away");
    const scoreCell = scoreCellHtml(match, { editable: !!currentUser });
    const timeCell = `<span class="time-start">${match.time}</span><span class="time-range"> – ${match.endTime}</span>`;
    return `<tr class="${rowCls}">
      <td class="col-time">${timeCell}</td>
      <td class="col-field">${escapeHtml(match.field)}</td>
      <td class="col-category">${phaseBadge}</td>
      <td class="col-game">
        <div class="col-game-inner">
          <span class="col-game-home">${homeCell}</span>
          <span class="col-game-score">${scoreCell}</span>
          <span class="col-game-away">${awayCell}</span>
        </div>
      </td>
    </tr>`;
  }).join("");
  restoreResultInputFocus(focus);
}

function syncScheduleTilesUI() {
  scheduleCategoryTiles.forEach((tile) => {
    const cat = tile.getAttribute("data-category-filter");
    const active = cat === selectedScheduleCategory;
    tile.classList.toggle("is-active", active);
    tile.setAttribute("aria-pressed", String(active));
  });
}

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

// Welche Zeitslot-Panels sind aktuell ausgeklappt? Ohne diesen externen Zustand
// würde jedes Re-Render (z.B. nach Speichern eines Punktestands via onSnapshot)
// alle Panels wieder einklappen, weil der hidden-Zustand nur am DOM hing.
const openOrgSlots = new Set();

function renderOrganizationPanel() {
  if (!orgRows) return;
  const focus = captureResultInputFocus();
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
    const isOpen = openOrgSlots.has(idx);
    const hiddenAttr = isOpen ? "" : " hidden";
    const arrow = isOpen ? "▴" : "▾";
    return `<div class="org-row"><button type="button" class="org-toggle${isOpen ? " is-open" : ""}" data-org-toggle="${idx}" aria-expanded="${isOpen}"><span>${slot.time}</span><span>${arrow}</span></button><div class="org-body" id="org-body-${idx}"${hiddenAttr}><div class="org-grid">${inner || '<div>Keine Paarung</div>'}</div></div></div>`;
  }).join("");
  restoreResultInputFocus(focus);
}

scheduleStandingsToggle?.addEventListener("click", () => {
  scheduleStandingsOpen = !scheduleStandingsOpen;
  renderScheduleStandings();
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const toggle = target.closest("[data-org-toggle]");
  if (!toggle) return;
  const idxAttr = toggle.getAttribute("data-org-toggle");
  if (idxAttr === null) return;
  const idx = Number(idxAttr);
  const body = document.getElementById(`org-body-${idxAttr}`);
  if (openOrgSlots.has(idx)) {
    openOrgSlots.delete(idx);
  } else {
    openOrgSlots.add(idx);
  }
  const isOpen = openOrgSlots.has(idx);
  if (body) body.hidden = !isOpen;
  toggle.setAttribute("aria-expanded", String(isOpen));
  toggle.classList.toggle("is-open", isOpen);
  const arrowEl = toggle.querySelector("span:last-child");
  if (arrowEl) arrowEl.textContent = isOpen ? "▴" : "▾";
});

// ── Buttons / Forms ──────────────────────────────────────────────────────────
createButton?.addEventListener("click", () => openModal());
cancelBtn?.addEventListener("click", () => closeModal());

dashboardTeamSelect?.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  renderTeamDashboard(target.value);
  commitNavigation();
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
// Klick auf einen Kategorie-Tile (z.B. "Ambitioniert" oder "Alle") setzt den
// Filter und öffnet bei Bedarf den Spielplan.
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const chip = target.closest("[data-category-filter]");
  if (!chip) return;
  event.preventDefault();
  const category = chip.getAttribute("data-category-filter");
  if (!category) return;
  selectedScheduleCategory = category;
  syncScheduleTilesUI();
  if (currentView === "schedule") {
    renderSchedule();
    commitNavigation();
  } else {
    // setView pusht den neuen History-Eintrag inkl. Filter-Zustand,
    // damit der Zurück-Button den Filter wieder entfernt.
    setView("schedule");
  }
});

// ── Ergebniseingabe (Org-Panel + Spielplan, nur angemeldet) ─────────────────
document.addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.matches(".result-input[data-result-match]") || !currentUser) return;
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
  if (updateHash && currentView === "infos") commitNavigation();
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
const VALID_CATEGORIES = ["adult_ambitious", "adult_fun", "youth"];
let currentView = "infos";
let currentInfosSection = "time_place";

// ── Navigation: zentraler History-Zustand ───────────────────────────────────
// Damit der Zurück-Button die letzte Aktion rückgängig macht (z.B. Filter
// entfernen, Team-Auswahl zurücksetzen) – statt sofort die vorige Seite zu
// laden – speichern wir den vollständigen UI-Zustand pro History-Eintrag.
function getCurrentState() {
  return {
    view: currentView,
    infosSection: currentInfosSection,
    scheduleCategory: selectedScheduleCategory,
    dashboardTeam: selectedTeamId,
    ranglisteCategory: selectedRanglisteCategory,
  };
}

function buildHash(state) {
  const params = new URLSearchParams();
  let path = state.view;
  if (state.view === "infos") {
    path = `infos/${state.infosSection || "time_place"}`;
  } else if (state.view === "schedule") {
    if (state.scheduleCategory && state.scheduleCategory !== "all") {
      params.set("cat", state.scheduleCategory);
    }
  } else if (state.view === "dashboard") {
    if (state.dashboardTeam) params.set("team", state.dashboardTeam);
  } else if (state.view === "rangliste") {
    if (state.ranglisteCategory && state.ranglisteCategory !== "adult_ambitious") {
      params.set("cat", state.ranglisteCategory);
    }
  }
  const qs = params.toString();
  return `#${path}${qs ? "?" + qs : ""}`;
}

function commitNavigation({ replace = false } = {}) {
  const state = getCurrentState();
  const target = buildHash(state);
  if (replace || location.hash === target) {
    history.replaceState(state, "", target);
  } else {
    history.pushState(state, "", target);
  }
}

// Zur Abwärtskompatibilität – einige Callsites verwendeten syncLocationHash().
function syncLocationHash() { commitNavigation(); }

function parseHash() {
  const raw = location.hash.replace(/^#/, "");
  const defaults = {
    view: "infos",
    infosSection: "time_place",
    scheduleCategory: "all",
    dashboardTeam: null,
    ranglisteCategory: "adult_ambitious",
  };
  if (!raw) return defaults;
  const [pathPart, queryPart] = raw.split("?");
  const params = new URLSearchParams(queryPart || "");
  const segs = pathPart.split("/");
  const viewPart = segs[0];
  const view = VALID_VIEWS.includes(viewPart) ? viewPart : "infos";
  const state = { ...defaults, view };
  if (view === "infos") {
    state.infosSection = VALID_INFOS_SECTIONS.includes(segs[1]) ? segs[1] : "time_place";
  } else if (view === "schedule") {
    const cat = params.get("cat");
    state.scheduleCategory = cat && (cat === "all" || VALID_CATEGORIES.includes(cat)) ? cat : "all";
  } else if (view === "dashboard") {
    state.dashboardTeam = params.get("team") || null;
  } else if (view === "rangliste") {
    const cat = params.get("cat");
    state.ranglisteCategory = cat && VALID_CATEGORIES.includes(cat) ? cat : "adult_ambitious";
  }
  return state;
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
  if (updateHash) commitNavigation();
}

// applyState aktualisiert sämtliche View- und Filter-Zustände auf einmal,
// ohne neue History-Einträge zu erzeugen. Wird nach popstate / beim Laden
// verwendet, um den UI-Zustand mit dem History-Eintrag zu synchronisieren.
function applyState(state, { updateHash = false } = {}) {
  selectedScheduleCategory = state.scheduleCategory ?? "all";
  selectedRanglisteCategory = state.ranglisteCategory ?? "adult_ambitious";
  currentInfosSection = state.infosSection ?? "time_place";

  const desiredDashboardTeam = state.dashboardTeam ?? null;
  if (desiredDashboardTeam) {
    selectedTeamId = desiredDashboardTeam;
  } else {
    selectedTeamId = null;
  }

  setInfosSection(currentInfosSection, { updateHash: false });

  syncScheduleTilesUI();
  if (ranglisteCategoryFilter) ranglisteCategoryFilter.value = selectedRanglisteCategory;
  if (dashboardTeamSelect) dashboardTeamSelect.value = selectedTeamId || "";

  renderSchedule();
  if (selectedTeamId) renderTeamDashboard(selectedTeamId);
  else renderDashboardEmptyState();
  renderRangliste();

  const view = isViewAccessible(state.view) ? state.view : "infos";
  setView(view, { updateHash: false });
  if (updateHash) commitNavigation({ replace: true });
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
  const fromState = event.state && typeof event.state === "object" && VALID_VIEWS.includes(event.state.view)
    ? event.state
    : null;
  const state = fromState || parseHash();
  applyState(state, { updateHash: false });
  // Falls der gewünschte View nicht zugänglich ist (z.B. Org ohne Login),
  // aktualisieren wir den Hash, damit er zur tatsächlichen Anzeige passt.
  const finalHash = buildHash(getCurrentState());
  if (location.hash !== finalHash) {
    history.replaceState(getCurrentState(), "", finalHash);
  }
});

const initial = parseHash();
applyState(initial, { updateHash: false });
history.replaceState(getCurrentState(), "", buildHash(getCurrentState()));

// ── Schlussrangliste ────────────────────────────────────────────────────────
function renderRangliste() {
  if (!ranglisteTableBody && !ranglisteFinalList) return;
  const codes = CATEGORY_CODES[selectedRanglisteCategory] || [];

  if (!codes.length) {
    if (ranglisteFinalList) {
      ranglisteFinalList.innerHTML = '<li>Keine Daten verfügbar.</li>';
    }
    if (ranglisteTableBody) {
      ranglisteTableBody.innerHTML = '<tr><td colspan="7">Keine Daten verfügbar.</td></tr>';
    }
    return;
  }

  // Schlussrangliste oben: pro Rang ein Eintrag. Noch nicht definitive Ränge
  // werden als „noch offen" angezeigt, statt vorläufige Gruppenphasen-Plätze
  // als endgültige Platzierung zu suggerieren.
  if (ranglisteFinalList) {
    const finalItems = getFinalRanking(selectedRanglisteCategory).map(
      ({ rank, code, team, definitive }) => {
        const isPending = !definitive;
        const teamLabel = !isPending && team
          ? escapeHtml(team.name)
          : !isPending && code
            ? escapeHtml(code)
            : "noch offen";
        const teamClass = isPending ? "rank-team is-pending" : "rank-team";
        const rowClass = `rank-row rank-${rank}${isPending ? " is-pending" : ""}`;
        return `<li class="${rowClass}"><span class="rank-number">${rank}.</span><span class="${teamClass}">${teamLabel}</span></li>`;
      }
    );
    ranglisteFinalList.innerHTML = finalItems.join("");
  }

  // Untere Tabelle: reine Gruppenphasen-Rangliste (gespielt/Punkte/Tore).
  if (ranglisteTableBody) {
    const rows = getSortedStandings(selectedRanglisteCategory).map(
      ({ code, team, pts, gf, ga, played }, idx) => {
        const teamLabel = team
          ? escapeHtml(team.name)
          : (code ? escapeHtml(code) : `<span class="team-placeholder">–</span>`);
        return `<tr><td>${idx + 1}</td><td>${teamLabel}</td><td>${played}</td><td>${pts}</td><td>${gf}</td><td>${ga}</td><td>${ratioText(gf, ga)}</td></tr>`;
      }
    );
    ranglisteTableBody.innerHTML = rows.join("");
  }
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
  commitNavigation();
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
