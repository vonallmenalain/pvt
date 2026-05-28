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
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  TOURNAMENT_SCHEDULE,
  SCHEDULE_SLOTS,
  CATEGORY_LABELS,
  CATEGORY_SHORT_LABELS,
  CATEGORY_CODES,
  CATEGORY_PREFIX,
  CODE_TO_CATEGORY,
  getAllNetSwitches,
} from "./tournament-schedule.js";

// ── DOM ──────────────────────────────────────────────────────────────────────
const ranglistePublishBtn = document.getElementById("rangliste-publish-btn");
const ranglisteUnpublishBtn = document.getElementById("rangliste-unpublish-btn");
const ranglistePublishedNote = document.getElementById("rangliste-published-note");
const ranglisteViewBtn = document.getElementById("show-rangliste");
const ranglistePanel = document.getElementById("rangliste-panel");
const ranglisteTableBody = document.getElementById("rangliste-table-body");
const ranglisteFinalList = document.getElementById("rangliste-final-list");
const ranglisteCategoryTiles = document.querySelectorAll(".rangliste-category-tiles .cat-tile");
const ranglisteFinaleTop3Section = document.getElementById("rangliste-finale-top3-section");
const ranglisteFinaleTop3Body = document.getElementById("rangliste-finale-top3-body");

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

const editModal = document.getElementById("team-edit-modal");
const editForm = document.getElementById("team-edit-form");
const editCancelBtn = document.getElementById("team-edit-cancel");
const editErrorEl = document.getElementById("team-edit-error");
const editCodeWarningEl = document.getElementById("team-edit-code-warning");
const editCategorySelect = document.getElementById("team-edit-category");
const editCodeSelect = document.getElementById("team-edit-code");

const dashboardPanel = document.getElementById("dashboard-panel");
const dashboardTeamSelect = document.getElementById("dashboard-team-select");
const dashboardTitle = document.getElementById("dashboard-team-title");
const dashboardInfo = document.getElementById("dashboard-team-info");
const dashboardGroupTable = document.getElementById("dashboard-group-table");
const dashboardFinalrundeSection = document.getElementById("dashboard-finalrunde-section");
const dashboardFinalrundeTable = document.getElementById("dashboard-finalrunde-table");
const dashboardMatchTable = document.getElementById("dashboard-match-table");
const dashboardZaehlerTable = document.getElementById("dashboard-zaehler-table");

const scheduleCategoryTiles = document.querySelectorAll(".schedule-category-tiles .cat-tile");
const scheduleTableBody = document.getElementById("schedule-table-body");
const scheduleStandingsWrap = document.getElementById("schedule-standings");
const scheduleStandingsToggle = document.getElementById("schedule-standings-toggle");
const scheduleStandingsBody = document.getElementById("schedule-standings-body");
const scheduleStandingsTable = document.getElementById("schedule-standings-table");
const scheduleFinalrundeStandingsWrap = document.getElementById("schedule-finalrunde-standings");
const scheduleFinalrundeToggle = document.getElementById("schedule-finalrunde-toggle");
const scheduleFinalrundeBody = document.getElementById("schedule-finalrunde-body");
const scheduleFinalrundeTable = document.getElementById("schedule-finalrunde-table");

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
let scheduleFinalrundeOpen = false;

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

function openEditModal(teamId) {
  const team = allTeams.find((t) => t.id === teamId);
  if (!team || !editForm) return;
  if (editErrorEl) editErrorEl.textContent = "";
  if (editCodeWarningEl) { editCodeWarningEl.textContent = ""; editCodeWarningEl.hidden = true; }
  editForm.dataset.originalCode = team.code ?? "";
  editForm.teamId.value = team.id;
  editForm.teamName.value = team.name ?? "";
  editForm.community.value = team.community ?? "";
  editForm.manager.value = team.manager ?? "";
  refreshEditTeamCodeOptions(team.category, team.code ?? "");
  editForm.category.value = team.category ?? "youth";
  editModal.hidden = false;
  editForm.teamName?.focus();
}

function closeEditModal() {
  if (editModal) editModal.hidden = true;
  if (editErrorEl) editErrorEl.textContent = "";
  if (editCodeWarningEl) { editCodeWarningEl.textContent = ""; editCodeWarningEl.hidden = true; }
  editForm?.reset();
}

function refreshEditTeamCodeOptions(category, selectedCode) {
  if (!editCodeSelect) return;
  const codes = CATEGORY_CODES[category] ?? [];
  const currentTeamId = editForm?.teamId.value ?? "";
  editCodeSelect.innerHTML =
    `<option value="">– kein Code –</option>` +
    codes
      .map((c) => {
        const holder = allTeams.find((t) => t.code === c && t.id !== currentTeamId);
        const suffix = holder ? ` (↔ ${escapeHtml(holder.name)})` : "";
        return `<option value="${c}" ${c === selectedCode ? "selected" : ""}>${c}${suffix}</option>`;
      })
      .join("");
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

// Liefert eine Map<rank, teamCode> für Gruppenränge, die bereits mathematisch
// feststehen – auch wenn noch nicht alle Gruppenspiele gespielt sind.
// Ein Rang gilt als gesichert, wenn:
//   • Mindestens (R-1) andere Teams unabhängig vom Ausgang aller noch offenen
//     Spiele mehr Punkte erzielen werden als dieses Team maximal erreichen kann
//     (oder beide Teams fertig sind und die Tiebreaker-Reihenfolge feststeht).
//   • Höchstens (R-1) andere Teams noch mehr Punkte erzielen könnten als dieses
//     Team aktuell hat – dabei gilt eine Punktegleichheit (oMax == team.pts)
//     als Bedrohung, solange mindestens eines der beiden Teams noch offene
//     Spiele hat (Tiebreaker stehen dann noch nicht fest).
function getEarlyResolvedGroupRanks(category) {
  if (allGroupMatchesPlayed(category)) return new Map();

  const standings = getSortedStandings(category);
  const groupMatches = getGroupMatchesForCategory(category);

  // Verbleibende Spiele pro Team zählen
  const remainingPerTeam = {};
  for (const { code } of standings) remainingPerTeam[code] = 0;
  for (const m of groupMatches) {
    if (!hasCompleteScore(m.id)) {
      if (m.home.code) remainingPerTeam[m.home.code] = (remainingPerTeam[m.home.code] || 0) + 1;
      if (m.away.code) remainingPerTeam[m.away.code] = (remainingPerTeam[m.away.code] || 0) + 1;
    }
  }

  const resolved = new Map();

  for (let i = 0; i < standings.length; i++) {
    const team = standings[i];
    const myMax = team.pts + 2 * (remainingPerTeam[team.code] || 0);
    const myRemaining = remainingPerTeam[team.code] || 0;

    // Teams, die DEFINITIV über mir liegen:
    //  – ihre aktuellen Punkte > mein Maximum, ODER
    //  – beide Teams haben keine offenen Spiele mehr UND das andere Team
    //    steht in der aktuellen Rangliste über mir (Tiebreaker sind endgültig).
    const definitelyAbove = standings.filter((o, j) => {
      if (j === i) return false;
      if (o.pts > myMax) return true;
      if (myRemaining === 0 && (remainingPerTeam[o.code] || 0) === 0 && j < i) return true;
      return false;
    }).length;

    // Teams, die mich noch überholen KÖNNTEN:
    //  – ihr Maximum > meine aktuellen Punkte, ODER
    //  – sie könnten auf gleiche Punktzahl kommen UND die Tiebreaker stehen
    //    noch nicht fest (mindestens eines der beiden Teams hat offene Spiele).
    const couldExceed = standings.filter((o, j) => {
      if (j === i) return false;
      const oRemaining = remainingPerTeam[o.code] || 0;
      const oMax = o.pts + 2 * oRemaining;
      if (oMax > team.pts) return true;
      if (oMax === team.pts && (oRemaining > 0 || myRemaining > 0)) return true;
      return false;
    }).length;

    const rank = i + 1;
    if (definitelyAbove >= rank - 1 && couldExceed <= rank - 1) {
      resolved.set(rank, team.code);
    }
  }

  return resolved;
}

// Liefert für eine Match-Referenz (z.B. { rank: 3 }, { code: "A1" }, { winnerOf: "a-q1" })
// den zugehörigen Team-Code (A1/P3/...) – oder null, falls noch nicht aufgelöst.
// Rang-Referenzen werden aufgelöst, sobald der Gruppenrang mathematisch feststeht –
// entweder weil alle Gruppenspiele gespielt sind oder weil der Rang bereits gesichert
// ist (getEarlyResolvedGroupRanks).
function resolveRefCode(ref, category) {
  if (!ref) return null;
  if (ref.code) return ref.code;
  if (ref.rank) {
    if (allGroupMatchesPlayed(category)) {
      const standings = getSortedStandings(category);
      return standings[ref.rank - 1]?.code ?? null;
    }
    // Früherkennung: Rang bereits mathematisch gesichert?
    const earlyRanks = getEarlyResolvedGroupRanks(category);
    return earlyRanks.get(ref.rank) ?? null;
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
//   "Jugendliche 1"  → J1 … "Jugendliche 9"   → J9
//   "Plausch 1"      → P1 … "Plausch 4"       → P4
//   "Ambitioniert 1" → A1 … "Ambitioniert 6"  → A6
// So sind Teams ohne explizit gesetzten Code automatisch an den Spielplan
// gekoppelt. Ein bereits gesetzter Code hat Vorrang; doppelte Codes werden
// nicht überschrieben.
const AUTO_CODE_PATTERNS = [
  { prefix: "J", re: /^Jugendliche\s+(\d+)$/i,  max: 9, category: "youth" },
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

  // First pass: name-pattern based auto-assignment.
  const result = teams.map((team) => {
    if (team.code) return team;
    const auto = autoResolveCodeFromName(team);
    if (!auto || taken.has(auto)) return team;
    taken.add(auto);
    return { ...team, code: auto, autoCode: true };
  });

  // Second pass: unambiguous fallback — if exactly one code slot in a category
  // is unoccupied and exactly one team in that category still has no code,
  // the assignment is deterministic and is applied automatically.
  for (const { prefix, max, category } of AUTO_CODE_PATTERNS) {
    const allCodes = Array.from({ length: max }, (_, i) => `${prefix}${i + 1}`);
    const freeCodes = allCodes.filter((c) => !taken.has(c));
    if (freeCodes.length !== 1) continue;
    const uncodedInCategory = result.filter((t) => !t.code && t.category === category);
    if (uncodedInCategory.length !== 1) continue;
    const freeCode = freeCodes[0];
    const target   = uncodedInCategory[0];
    taken.add(freeCode);
    result[result.indexOf(target)] = { ...target, code: freeCode, autoCode: true };
  }

  return result;
}

// ── Standings (per Kategorie, nur Gruppenspiele) ─────────────────────────────
function getGroupMatchesForCategory(category) {
  return TOURNAMENT_SCHEDULE.filter((m) => m.category === category && m.phaseKind === "group");
}

function calcStatsForCode(code, category) {
  let pts = 0, wins = 0, gf = 0, ga = 0, played = 0;
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
    else if ((isHome && h > a) || (isAway && a > h)) { pts += 2; wins++; }
  }
  return { pts, wins, gf, ga, played };
}

// Sortiert die Codes einer Kategorie nach: Punkte > Siege > Erzielte Punkte > Punkteverhältnis > Code.
// Liefert Array von { code, team, pts, wins, gf, ga, played }.
function getSortedStandings(category) {
  const codes = CATEGORY_CODES[category] || [];
  return codes
    .map((code) => ({ code, team: getTeamByCode(code), ...calcStatsForCode(code, category) }))
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.gf !== a.gf) return b.gf - a.gf;
      const ratioA = a.ga === 0 ? (a.gf > 0 ? Infinity : 0) : a.gf / a.ga;
      const ratioB = b.ga === 0 ? (b.gf > 0 ? Infinity : 0) : b.gf / b.ga;
      if (ratioB !== ratioA) return ratioB - ratioA;
      return a.code.localeCompare(b.code);
    });
}

// ── Schlussrangliste (Gruppe + Finalspiele) ─────────────────────────────────
// Beschreibt, welche Finalspiel-Resultate welchen Schluss-Rang bestimmen.
// Jugend Ränge 1–3 werden nicht hier gelistet: sie folgen aus der
// Round-Robin-Tabelle der Finalrunde Top 3 (getFinalrundeTop3Standings).
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
    // Ränge 1–3 werden durch die Finalrunde Top 3 (Round-Robin) bestimmt,
    // nicht durch Einzelspiele – siehe getFinalRanking / getFinalrundeTop3Standings.
    { rank: 4, kind: "winner", matchId: "j-p4"  },
    { rank: 5, kind: "loser",  matchId: "j-p4"  },
    { rank: 6, kind: "winner", matchId: "j-p6"  },
    { rank: 7, kind: "loser",  matchId: "j-p6"  },
    { rank: 8, kind: "winner", matchId: "j-p8"  },
    { rank: 9, kind: "loser",  matchId: "j-p8"  },
  ],
};

// Berechnet die Round-Robin-Tabelle der «Finalrunde Top 3» (nur Jugend).
// Gewertet werden die Matches j-fr1, j-fr2 und j-fin; jedes der drei Teams
// spielt genau zweimal. Das Ergebnis wird nach Punkten / Siege /
// erzielten Punkten / Punkteverhältnis / Code sortiert.
// Gibt null zurück, solange die drei Finalisten noch nicht feststehen.
function getFinalrundeTop3Standings() {
  const category = "youth";
  const FINALRUNDE_IDS = ["j-fr1", "j-fr2", "j-fin"];

  // Die 3 Teams feststellen (Gruppenränge 1–3, sobald gesichert oder Gruppe fertig)
  const groupComplete = allGroupMatchesPlayed(category);
  let top3Codes;

  if (groupComplete) {
    const gs = getSortedStandings(category);
    top3Codes = [gs[0]?.code, gs[1]?.code, gs[2]?.code].filter(Boolean);
  } else {
    const early = getEarlyResolvedGroupRanks(category);
    top3Codes = [early.get(1), early.get(2), early.get(3)].filter(Boolean);
  }

  if (top3Codes.length === 0) return null;

  // Nur mit vollständiger Dreiergruppe weiterarbeiten
  if (top3Codes.length < 3) return null;

  const finalrundeMatches = TOURNAMENT_SCHEDULE.filter((m) => FINALRUNDE_IDS.includes(m.id));
  const allDone = finalrundeMatches.every((m) => hasCompleteScore(m.id));

  // Statistiken für die Top-3-Teams aus den Finalrunde-Matches berechnen
  const statsMap = {};
  for (const code of top3Codes) statsMap[code] = { pts: 0, wins: 0, gf: 0, ga: 0, played: 0 };

  for (const match of finalrundeMatches) {
    if (!hasCompleteScore(match.id)) continue;
    const homeCode = resolveRefCode(match.home, match.category);
    const awayCode = resolveRefCode(match.away, match.category);
    if (!homeCode || !awayCode) continue;

    const score = resultMap[match.id];
    const h = Number(score.home);
    const a = Number(score.away);

    if (statsMap[homeCode] !== undefined) {
      statsMap[homeCode].played++;
      statsMap[homeCode].gf += h;
      statsMap[homeCode].ga += a;
      if (h > a) { statsMap[homeCode].pts += 2; statsMap[homeCode].wins++; }
      else if (h === a) statsMap[homeCode].pts += 1;
    }
    if (statsMap[awayCode] !== undefined) {
      statsMap[awayCode].played++;
      statsMap[awayCode].gf += a;
      statsMap[awayCode].ga += h;
      if (a > h) { statsMap[awayCode].pts += 2; statsMap[awayCode].wins++; }
      else if (h === a) statsMap[awayCode].pts += 1;
    }
  }

  const rows = top3Codes.map((code) => ({
    code,
    team: getTeamByCode(code),
    definitive: allDone,
    ...statsMap[code],
  }));

  // Nach Finalrunden-Tabelle sortieren: Punkte > Siege > Erzielte Punkte > Punkteverhältnis > Code
  rows.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.gf !== a.gf) return b.gf - a.gf;
    const ratioA = a.ga === 0 ? (a.gf > 0 ? Infinity : 0) : a.gf / a.ga;
    const ratioB = b.ga === 0 ? (b.gf > 0 ? Infinity : 0) : b.gf / b.ga;
    if (ratioB !== ratioA) return ratioB - ratioA;
    return a.code.localeCompare(b.code);
  });

  return rows;
}

// Liefert die Schlussrangliste einer Kategorie als Array von
// { rank, code, team, pts, gf, ga, played, definitive }.
//
// Ein Rang gilt als `definitive`, sobald sein endgültiger Platz feststeht:
//   - Jugend Ränge 1–3: alle drei Finalrunde-Matches (j-fr1, j-fr2, j-fin) müssen
//     gespielt sein (Round-Robin-Tabelle über getFinalrundeTop3Standings).
//   - Wird er durch ein Finalspiel bestimmt (FINAL_RANK_RULES), muss dieses
//     Spiel ein vollständiges Resultat haben.
//   - Wird er durch keinen Eintrag in FINAL_RANK_RULES abgedeckt, muss der
//     Gruppenrang gesichert sein (alle Gruppenspiele gespielt oder via
//     getEarlyResolvedGroupRanks mathematisch gesichert).
//
// Nicht-definitive Ränge bleiben in der Schlussrangliste leer (code/team =
// null), so dass die Ansicht nichts Vorläufiges als „endgültig" suggeriert.
function getFinalRanking(category) {
  const groupStandings = getSortedStandings(category);
  const total = groupStandings.length;
  const rules = FINAL_RANK_RULES[category] || [];
  const groupComplete = allGroupMatchesPlayed(category);
  const earlyRanks = groupComplete ? null : getEarlyResolvedGroupRanks(category);

  const ruleByRank = new Map();
  for (const rule of rules) ruleByRank.set(rule.rank, rule);

  const result = [];
  for (let i = 0; i < total; i++) {
    const rank = i + 1;
    let code = null;
    let definitive = false;

    // Jugend Ränge 1–3: Round-Robin-Tabelle der Finalrunde Top 3 ist massgebend.
    if (category === "youth" && rank <= 3) {
      const top3 = getFinalrundeTop3Standings();
      if (top3 && top3.length >= rank && top3[rank - 1].definitive) {
        code = top3[rank - 1].code;
        definitive = true;
      }
    } else {
      const rule = ruleByRank.get(rank);
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
      } else if (earlyRanks && earlyRanks.has(rank)) {
        code = earlyRanks.get(rank);
        definitive = true;
      }
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

// Prüft, ob zwei Match-Referenzen dasselbe Team meinen. Vergleich erfolgt
// (1) über aufgelöste Team-IDs, falls beide Refs schon einer konkreten Mannschaft
//     zugeordnet sind, sonst (2) über aufgelöste Spielcodes (z.B. "A2") und
// schliesslich (3) strukturell – gleicher Code, gleicher Rang oder gleiche
// winnerOf/loserOf-Quelle gelten als identisches Team.
function refsAreSameTeam(refA, refB, categoryA, categoryB) {
  if (!refA || !refB) return false;
  const idA = refTeamId(refA, categoryA);
  const idB = refTeamId(refB, categoryB);
  if (idA && idB) return idA === idB;
  const codeA = refTeamCode(refA, categoryA);
  const codeB = refTeamCode(refB, categoryB);
  if (codeA && codeB) return codeA === codeB;
  if (refA.code && refB.code) return refA.code === refB.code;
  if (refA.rank && refB.rank) {
    return refA.rank === refB.rank && categoryA === categoryB;
  }
  if (refA.winnerOf && refB.winnerOf) return refA.winnerOf === refB.winnerOf;
  if (refA.loserOf && refB.loserOf) return refA.loserOf === refB.loserOf;
  return false;
}

// Bestimmt die Resultatverantwortung ("Zähler") für ein Match.
//   • Standardmässig: das erstgenannte Team aus dem unmittelbar vorherigen
//     Spiel auf demselben Feld (Heim des Vorgängers).
//   • Beim allerersten Spiel auf einem Feld: "Turnierorganisation".
//   • Wenn dieses Team im aktuellen Spiel selbst mitspielt (Heim oder Gast) –
//     was vor allem in der Finalrunde durch winnerOf/loserOf/Rang-Verweise
//     vorkommen kann –: ebenfalls "Turnierorganisation".
function getZaehlerForMatch(match) {
  const sameField = TOURNAMENT_SCHEDULE
    .filter((m) => m.field === match.field)
    .sort((a, b) => a.time.localeCompare(b.time));
  const idx = sameField.findIndex((m) => m.id === match.id);
  if (idx <= 0) {
    return { kind: "org" };
  }
  const prev = sameField[idx - 1];
  const playsCurrent =
    refsAreSameTeam(prev.home, match.home, prev.category, match.category) ||
    refsAreSameTeam(prev.home, match.away, prev.category, match.category);
  if (playsCurrent) {
    return { kind: "org" };
  }
  return { kind: "team", ref: prev.home, category: prev.category };
}

function zaehlerCellHtml(match) {
  const z = getZaehlerForMatch(match);
  if (z.kind === "org") {
    return `<span class="schedule-zaehler-org">Turnierorganisation</span>`;
  }
  const teamId = refTeamId(z.ref, z.category);
  const displayName = refDisplayName(z.ref, z.category);
  if (teamId) {
    return `<button type="button" class="team-link schedule-zaehler-team" data-team-select="${teamId}">${escapeHtml(displayName)}</button>`;
  }
  return `<span class="team-placeholder schedule-zaehler-team">${escapeHtml(displayName)}</span>`;
}

// Analog zu zaehlerCellHtml, aber mit Org-Panel-Klassen (kleinere/grauere
// Schrift, rechtsbündig in der eigenen Spalte rechts neben den Teams).
function orgZaehlerHtml(match) {
  const z = getZaehlerForMatch(match);
  if (z.kind === "org") {
    return `<span class="org-zaehler-org">Turnierorganisation</span>`;
  }
  const teamId = refTeamId(z.ref, z.category);
  const displayName = refDisplayName(z.ref, z.category);
  if (teamId) {
    return `<button type="button" class="team-link org-zaehler-team" data-team-select="${teamId}">${escapeHtml(displayName)}</button>`;
  }
  return `<span class="team-placeholder org-zaehler-team">${escapeHtml(displayName)}</span>`;
}

// Liefert alle Spiele, bei denen das angegebene Team gemäss Zähler-Regel
// für das Zählen / Abgeben des Resultatzettels zuständig ist. Ein Team
// gilt nur dann als Zähler, wenn die Zähler-Referenz schon konkret auf
// dieses Team aufgelöst werden kann (über `refTeamId`). Spiele mit noch
// unaufgelöstem Vorgänger (z. B. "Sieger Halbfinal 1") werden erst
// sichtbar, sobald die Auflösung möglich ist – analog zur Spielplan-
// Anzeige der Zähler-Spalte.
function getZaehlerMatchesForTeam(team) {
  if (!team || !team.id) return [];
  const out = [];
  for (const match of TOURNAMENT_SCHEDULE) {
    const z = getZaehlerForMatch(match);
    if (z.kind !== "team") continue;
    const id = refTeamId(z.ref, z.category);
    if (id === team.id) out.push(match);
  }
  return out;
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

// Füllt ein <tbody>-Element mit den 3 Zeilen der Finalrunde Top 3.
// Solange die Top-3-Teams noch nicht feststehen, erscheint «noch offen» als
// Teamname. Ein optionaler selectedCode hebt die eigene Zeile hervor.
function renderFinalrundeTop3Table(tbodyEl, selectedCode = null) {
  if (!tbodyEl) return;
  const top3 = getFinalrundeTop3Standings();
  const tableRows = [0, 1, 2].map((i) => {
    const entry = top3 ? top3[i] : null;
    const isSelected = entry && selectedCode && entry.code === selectedCode;
    const rowClass = isSelected ? ' class="is-selected-row"' : "";
    if (!entry) {
      return `<tr${rowClass}><td>${i + 1}</td><td><span class="team-placeholder">noch offen</span></td><td>–</td><td>–</td><td>–</td><td>–</td><td>–</td></tr>`;
    }
    const nameCell = entry.team
      ? `<button type="button" class="team-link" data-team-select="${entry.team.id}">${escapeHtml(entry.team.name)}</button>`
      : (entry.code ? escapeHtml(entry.code) : `<span class="team-placeholder">noch offen</span>`);
    return `<tr${rowClass}><td>${i + 1}</td><td>${nameCell}</td><td>${entry.played}</td><td>${entry.pts}</td><td>${entry.gf}</td><td>${entry.ga}</td><td>${ratioText(entry.gf, entry.ga)}</td></tr>`;
  });
  tbodyEl.innerHTML = tableRows.join("");
}

function renderScheduleFinalrundeStandings() {
  if (!scheduleFinalrundeStandingsWrap) return;
  const showFinalrunde = selectedScheduleCategory === "youth";
  scheduleFinalrundeStandingsWrap.hidden = !showFinalrunde;
  if (!showFinalrunde) return;

  if (scheduleFinalrundeBody) scheduleFinalrundeBody.hidden = !scheduleFinalrundeOpen;
  if (scheduleFinalrundeToggle) {
    scheduleFinalrundeToggle.setAttribute("aria-expanded", String(scheduleFinalrundeOpen));
    scheduleFinalrundeToggle.classList.toggle("is-open", scheduleFinalrundeOpen);
  }

  renderFinalrundeTop3Table(scheduleFinalrundeTable);
}

function renderSchedule() {
  renderScheduleStandings();
  renderScheduleFinalrundeStandings();
  if (!scheduleTableBody) return;
  const focus = captureResultInputFocus();
  const matches = scheduleMatchesFiltered();
  if (!matches.length) {
    scheduleTableBody.innerHTML = '<tr><td colspan="8">Keine Spiele für die gewählten Filter.</td></tr>';
    restoreResultInputFocus(focus);
    return;
  }
  scheduleTableBody.innerHTML = matches.map((match) => {
    const rowCls = rowClassForCategory(match.category);
    const phaseBadge = phaseChipHtml(match);
    const homeCell = teamCellHtml(match.home, match.category, match.id, "home");
    const awayCell = teamCellHtml(match.away, match.category, match.id, "away");
    const scoreCell = scoreCellHtml(match, { editable: !!currentUser });
    const zaehlerCell = zaehlerCellHtml(match);
    // Zeit ist in zwei Zellen aufgeteilt: nur die Start-Zeit (linke Zelle)
    // bleibt beim horizontalen Scrollen am linken Rand sticky; die End-Zeit
    // (z. B. "– 12:10") scrollt ganz normal mit dem Rest der Zeile mit.
    // Heimteam, Resultat und Gastteam stehen in drei separaten Zellen, damit
    // der Browser die Spaltenbreiten automatisch nach dem längsten Namen
    // berechnet und das Resultat immer auf derselben horizontalen Position
    // bleibt – unabhängig davon, wie lang die Teamnamen in der jeweiligen
    // Zeile sind.
    return `<tr class="${rowCls}">
      <td class="col-time-start">${match.time}</td>
      <td class="col-time-end">– ${match.endTime}</td>
      <td class="col-field">${escapeHtml(match.field)}</td>
      <td class="col-category">${phaseBadge}</td>
      <td class="col-game-home">${homeCell}</td>
      <td class="col-game-score">${scoreCell}</td>
      <td class="col-game-away">${awayCell}</td>
      <td class="col-zaehler">${zaehlerCell}</td>
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
  const isAdmin = Boolean(currentUser);
  return `<li class="team-card" data-team-select="${team.id}">
    <div class="team-card-content">
      <p class="team-name">${escapeHtml(team.name)}</p>
      <p class="team-meta">Gemeinde: ${escapeHtml(team.community)}</p>
      <p class="team-meta">Teamverantwortlich: ${escapeHtml(team.manager)}</p>
    </div>
    ${isAdmin ? `<div class="team-admin-actions">
      <button type="button" class="team-edit" data-team-id="${team.id}">Bearbeiten</button>
      <button type="button" class="team-delete" data-team-id="${team.id}">Löschen</button>
    </div>` : ""}
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
  if (dashboardFinalrundeSection) dashboardFinalrundeSection.hidden = true;
  dashboardMatchTable.innerHTML = '<tr><td colspan="7">Noch kein Team ausgewählt.</td></tr>';
  if (dashboardZaehlerTable) {
    dashboardZaehlerTable.innerHTML = '<tr><td colspan="7">Noch kein Team ausgewählt.</td></tr>';
  }
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

  // Reveal-Logic: zeige Playoff-Spiele, sobald das eigene Team auf einer Seite
  // feststeht (Rang mathematisch gesichert oder Vorrundenspiel bereits beendet).
  // Der Gegner kann noch offen sein – er erscheint dann als "Rang N" / "Sieger …".
  const sortedPlayoffs = playoffMatches.slice().sort((a, b) => a.time.localeCompare(b.time));
  for (const m of sortedPlayoffs) {
    const homeCode = refTeamCode(m.home, m.category);
    const awayCode = refTeamCode(m.away, m.category);
    const isMine = homeCode === code || awayCode === code;
    if (!isMine) continue;
    // Eigenes Team steht auf mindestens einer Seite fest → Spiel anzeigen,
    // auch wenn der Gegner noch nicht aufgelöst ist.
    teamMatches.push(m);
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

  // Tabelle Finalrunde Top 3 – nur für Jugend-Teams, die zur Top 3 gehören.
  if (dashboardFinalrundeSection) {
    const isYouth = category === "youth";
    const top3 = isYouth ? getFinalrundeTop3Standings() : null;
    const isInTop3 = top3 ? top3.some((e) => e.code === code) : false;
    dashboardFinalrundeSection.hidden = !isInTop3;
    if (isInTop3) {
      renderFinalrundeTop3Table(dashboardFinalrundeTable, code);
    }
  }

  // Im Dashboard erscheinen zwei getrennte Tabellen:
  //   • "Eigene Spiele"  – das ausgewählte Team spielt selbst mit.
  //   • "Zählen"         – das Team zählt das Spiel und gibt den
  //                        Resultatzettel ab (gemäss Zähler-Regel).
  // Beide Tabellen haben dasselbe Layout wie der Spielplan: zwei
  // Zeit-Zellen (Start sticky, Ende scrollt mit), Feld als Zahl,
  // Phase als farbiges Chip, Spiel als Inner-Grid mit Heim/Score/Gast.
  // Eine eigene "Zähler"-Spalte ist nicht mehr nötig: jede Tabelle
  // erklärt sich durch ihre Überschrift.
  const playerMatches = getMatchesForTeam(selectedTeam);
  const allZaehlerMatches = getZaehlerMatchesForTeam(selectedTeam);
  const playerIds = new Set(playerMatches.map((m) => m.id));
  // Spiele, in denen das Team selbst mitspielt UND zählen müsste, gehören
  // ausschliesslich in "Eigene Spiele". In der Zählen-Liste tauchen
  // sie nicht zusätzlich auf – die Zähler-Verantwortung fällt in solchen
  // Fällen ohnehin an die Turnierorganisation (siehe getZaehlerForMatch).
  const zaehlerMatches = allZaehlerMatches
    .filter((m) => !playerIds.has(m.id))
    .sort((a, b) => a.time.localeCompare(b.time));

  const renderRow = (match) => {
    const phaseBadge = phaseChipHtml(match);
    const homeCell = teamCellHtml(match.home, match.category, match.id, "home");
    const awayCell = teamCellHtml(match.away, match.category, match.id, "away");
    const scoreCell = scoreCellHtml(match);
    return `<tr>
      <td class="col-time-start">${match.time}</td>
      <td class="col-time-end">– ${match.endTime}</td>
      <td class="col-field">${escapeHtml(match.field)}</td>
      <td class="col-category">${phaseBadge}</td>
      <td class="col-game-home">${homeCell}</td>
      <td class="col-game-score">${scoreCell}</td>
      <td class="col-game-away">${awayCell}</td>
    </tr>`;
  };

  if (playerMatches.length) {
    dashboardMatchTable.innerHTML = playerMatches.map(renderRow).join("");
  } else if (!code) {
    dashboardMatchTable.innerHTML = '<tr><td colspan="7">Diesem Team ist noch kein Spielcode zugewiesen.</td></tr>';
  } else {
    dashboardMatchTable.innerHTML = '<tr><td colspan="7">Keine eigenen Spiele gefunden.</td></tr>';
  }

  if (dashboardZaehlerTable) {
    if (zaehlerMatches.length) {
      dashboardZaehlerTable.innerHTML = zaehlerMatches.map(renderRow).join("");
    } else {
      dashboardZaehlerTable.innerHTML = '<tr><td colspan="7">Kein Zählen für dieses Team.</td></tr>';
    }
  }
}

function renderDashboardTeamOptions() {
  if (!dashboardTeamSelect) return;
  const categoryOrder = ["youth", "adult_fun", "adult_ambitious"];
  const categoryGroupLabels = {
    youth: "Jugendliche",
    adult_fun: "Plausch",
    adult_ambitious: "Ambitioniert",
  };
  const byCategory = { youth: [], adult_fun: [], adult_ambitious: [] };
  allTeams.slice().sort((a, b) => a.name.localeCompare(b.name, "de")).forEach((team) => {
    if (byCategory[team.category]) byCategory[team.category].push(team);
  });
  const groups = categoryOrder.map((cat) => {
    if (!byCategory[cat].length) return "";
    const opts = byCategory[cat].map((team) =>
      `<option value="${team.id}">${escapeHtml(team.name)}</option>`
    ).join("");
    return `<optgroup label="${categoryGroupLabels[cat]}">${opts}</optgroup>`;
  }).join("");
  dashboardTeamSelect.innerHTML = `<option value="">Bitte Team auswählen</option>${groups}`;
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

  // Netzhöhen-Wechsel über alle Felder: Feld 1 wechselt bei 12:12 (Jugend →
  // Ambitioniert), Feld 2 bei 13:12, 14:00, 15:12 und 16:00.
  const netSwitches = getAllNetSwitches();

  // Feste Abhängigkeits-Hinweise: Zeiten, bei denen das Folge-Playoff-Spiel
  // vom Ergebnis der vorherigen Runde abhängt, werden ebenfalls rot markiert.
  const ORG_DEPENDENCY_LABELS = {
    "15:12": ["(Abhängigkeit Vorangehendes Spiel Ambitioniert)"],
    "15:48": [
      "(Abhängigkeit Vorangehendes Spiel Junioren)",
      "(Abhängigkeit Vorangehendes Spiel Ambitioniert)",
    ],
    "16:30": ["(Abhängigkeit Vorangehendes Spiel Plausch)"],
  };

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
        : `<span class="org-pending" title="Paarung noch nicht aufgelöst">–</span>`;
      const zaehler = orgZaehlerHtml(match);
      return `<div class="org-match">
        <span class="org-field">Feld ${match.field}</span>
        <span class="org-cat">${categoryChipHtml(match.category)}</span>
        <span class="org-team">${escapeHtml(homeName)}</span>
        <span class="org-score">${inputs}</span>
        <span class="org-team org-team-away">${escapeHtml(awayName)}</span>
        ${zaehler}
        ${phaseInfo}
      </div>`;
    }).join("");
    const isOpen = openOrgSlots.has(idx);
    const hiddenAttr = isOpen ? "" : " hidden";
    const arrow = isOpen ? "▴" : "▾";

    // Alle Labels für diesen Slot sammeln (Netzhöhe + Abhängigkeiten).
    const slotLabels = [];
    const netSwitchMatch = slot.matches.find((m) => netSwitches.has(m.id));
    if (netSwitchMatch) {
      const sw = netSwitches.get(netSwitchMatch.id);
      const toLabel = sw.to === "youth" ? "Jugend" : "Erwachsene";
      slotLabels.push({
        text: "(Wechsel Netzhöhe)",
        title: `Vor diesem Spiel muss die Netzhöhe auf Feld ${sw.field} auf ${toLabel} angepasst werden.`,
      });
    }
    const depLabels = ORG_DEPENDENCY_LABELS[slot.time] || [];
    for (const label of depLabels) {
      slotLabels.push({ text: label, title: "" });
    }

    const hasAlert = slotLabels.length > 0;
    const timeSpanClass = hasAlert ? "org-time-alert" : "";
    const labelHtml = slotLabels
      .map((l) => `<span class="org-time-label"${l.title ? ` title="${escapeHtml(l.title)}"` : ""}>${escapeHtml(l.text)}</span>`)
      .join("");
    const timeHtml = hasAlert
      ? `<span class="${timeSpanClass}">${slot.time}${labelHtml}</span>`
      : `<span>${slot.time}</span>`;

    return `<div class="org-row"><button type="button" class="org-toggle${isOpen ? " is-open" : ""}" data-org-toggle="${idx}" aria-expanded="${isOpen}">${timeHtml}<span class="org-arrow">${arrow}</span></button><div class="org-body" id="org-body-${idx}"${hiddenAttr}><div class="org-grid">${inner || '<div>Keine Paarung</div>'}</div></div></div>`;
  }).join("");

  // Spaltenbreiten (--org-team-w / --org-zaehler-w) berechnen, damit alle
  // Kacheln dasselbe Raster verwenden und die Punkte-Eingabefelder vertikal
  // sauber untereinander stehen. Die Breite richtet sich nach dem längsten
  // tatsächlich angezeigten Teamnamen bzw. Zähler-Text.
  applyOrgColumnWidths();

  restoreResultInputFocus(focus);
}

// Misst die Pixel-Breite der längsten Teamnamen und Zähler-Texte und setzt
// damit die CSS-Variablen, die das Org-Grid antreiben. Ergebnis: jede Kachel
// ist nur so breit wie nötig, alle Kacheln sind aber gleich breit.
function applyOrgColumnWidths() {
  if (!orgRows) return;
  if (!TOURNAMENT_SCHEDULE.length) return;
  // Wenn das Org-Panel (oder ein Vorfahre) gerade ausgeblendet ist
  // (display:none via [hidden]), liefert getBoundingClientRect() für
  // Nachfahren konstant 0 zurück. Würden wir dann trotzdem messen, würden
  // die CSS-Variablen --org-team-w / --org-zaehler-w auf den reinen Puffer-
  // Wert (~2px) gesetzt und das Grid wäre nach dem Einblenden viel zu schmal,
  // bis ein resize-Event eine Neumessung auslöst. Wir überspringen die
  // Messung in diesem Fall, sodass die zuletzt gültigen Werte erhalten
  // bleiben, und holen sie nach, sobald die Ansicht eingeblendet wird.
  if (!orgRows.isConnected || orgRows.offsetParent === null) return;

  const probe = document.createElement("div");
  probe.className = "org-probe";
  orgRows.appendChild(probe);

  const measureHtml = (html) => {
    probe.innerHTML = html;
    const el = probe.firstElementChild || probe;
    return el.getBoundingClientRect().width;
  };

  let maxTeam = 0;
  let maxZaehler = measureHtml(`<span class="org-zaehler-org">Turnierorganisation</span>`);
  for (const match of TOURNAMENT_SCHEDULE) {
    const h = refDisplayName(match.home, match.category);
    const a = refDisplayName(match.away, match.category);
    maxTeam = Math.max(
      maxTeam,
      measureHtml(`<span class="org-team">${escapeHtml(h)}</span>`),
      measureHtml(`<span class="org-team">${escapeHtml(a)}</span>`),
    );
    const z = getZaehlerForMatch(match);
    if (z.kind === "team") {
      const zname = refDisplayName(z.ref, z.category);
      const teamId = refTeamId(z.ref, z.category);
      const html = teamId
        ? `<button type="button" class="team-link org-zaehler-team">${escapeHtml(zname)}</button>`
        : `<span class="team-placeholder org-zaehler-team">${escapeHtml(zname)}</span>`;
      maxZaehler = Math.max(maxZaehler, measureHtml(html));
    }
  }

  orgRows.removeChild(probe);

  // Kleiner Puffer gegen Subpixel-Rundungen / Italic-Overhang.
  const teamPx = Math.ceil(maxTeam) + 2;
  const zaehlerPx = Math.ceil(maxZaehler) + 2;
  orgRows.style.setProperty("--org-team-w", `${teamPx}px`);
  orgRows.style.setProperty("--org-zaehler-w", `${zaehlerPx}px`);
}

scheduleStandingsToggle?.addEventListener("click", () => {
  scheduleStandingsOpen = !scheduleStandingsOpen;
  renderScheduleStandings();
});

scheduleFinalrundeToggle?.addEventListener("click", () => {
  scheduleFinalrundeOpen = !scheduleFinalrundeOpen;
  renderScheduleFinalrundeStandings();
});

// Schriftgrösse des Org-Panels kann sich beim Wechsel zwischen Desktop und
// Mobile ändern (Media-Query). Damit die Spaltenbreiten in solchen Fällen
// nachgeführt werden, messen wir nach jedem (entprellten) Resize neu.
let orgResizeTimer = null;
window.addEventListener("resize", () => {
  if (!orgRows) return;
  clearTimeout(orgResizeTimer);
  orgResizeTimer = setTimeout(applyOrgColumnWidths, 120);
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
  const arrowEl = toggle.querySelector(".org-arrow");
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

editCancelBtn?.addEventListener("click", () => closeEditModal());

editCodeSelect?.addEventListener("change", () => {
  const selectedCode = editCodeSelect.value;
  const currentTeamId = editForm?.teamId.value ?? "";
  const originalCode = editForm?.dataset.originalCode ?? "";
  const holder = selectedCode
    ? allTeams.find((t) => t.code === selectedCode && t.id !== currentTeamId)
    : null;
  if (editCodeWarningEl) {
    if (holder) {
      const swapHint = originalCode
        ? ` «${escapeHtml(holder.name)}» erhält dann ${originalCode}.`
        : ` «${escapeHtml(holder.name)}» verliert damit ihren Code.`;
      editCodeWarningEl.textContent = `Code ${selectedCode} ist momentan «${escapeHtml(holder.name)}» zugewiesen.${swapHint}`;
      editCodeWarningEl.hidden = false;
    } else {
      editCodeWarningEl.textContent = "";
      editCodeWarningEl.hidden = true;
    }
  }
});

editCategorySelect?.addEventListener("change", () => {
  refreshEditTeamCodeOptions(editCategorySelect.value, "");
  if (editCodeWarningEl) { editCodeWarningEl.textContent = ""; editCodeWarningEl.hidden = true; }
});

editForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const teamId = editForm.teamId.value;
  const name = editForm.teamName.value.trim();
  const community = editForm.community.value.trim();
  const manager = editForm.manager.value.trim();
  const category = editForm.category.value;
  const code = editCodeSelect?.value?.trim() || "";
  const originalCode = editForm.dataset.originalCode ?? "";
  if (!teamId || !name || !community || !manager || !category) {
    if (editErrorEl) editErrorEl.textContent = "Bitte alle Pflichtfelder ausfüllen.";
    return;
  }
  if (code && CODE_TO_CATEGORY[code] !== category) {
    if (editErrorEl) editErrorEl.textContent = "Spielcode passt nicht zur Kategorie.";
    return;
  }
  // If the chosen code is already held by another team, swap: that team gets
  // the current team's original code (or loses their code if there is none).
  const prevHolder = code ? allTeams.find((t) => t.code === code && t.id !== teamId) : null;
  const payload = { name, community, manager, category, code: code || null };
  try {
    if (prevHolder) {
      await updateDoc(doc(db, "teams", prevHolder.id), { code: originalCode || null });
    }
    await updateDoc(doc(db, "teams", teamId), payload);
    closeEditModal();
  } catch {
    if (editErrorEl) editErrorEl.textContent = "Team konnte nicht gespeichert werden.";
  }
});

// ── Firebase Auth + Snapshots ────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (createButton) createButton.hidden = !user;
  if (orgViewBtn) orgViewBtn.hidden = !user;
  if (!user && !orgPanel?.hidden) setView("infos");
  if (!user) { closeModal(); closeEditModal(); }
  document.querySelectorAll(".team-delete, .team-edit").forEach((button) => { button.hidden = !user; });
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

// ── Team-Klicks (Dashboard-Sprung) + Bearbeiten + Löschen ────────────────────
document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.matches(".team-edit")) {
    if (!currentUser) return;
    const teamId = target.dataset.teamId;
    if (teamId) openEditModal(teamId);
    return;
  }

  if (target.matches(".team-delete")) {
    if (!currentUser) return;
    const teamId = target.dataset.teamId;
    if (teamId) await deleteDoc(doc(db, "teams", teamId));
    return;
  }

  const teamCard = target.closest("[data-team-select]");
  if (teamCard) {
    renderTeamDashboard(teamCard.getAttribute("data-team-select"));
    setView("dashboard");
  }
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

// ── Teams-Subnav ────────────────────────────────────────────────────────────
const teamsSubButtons = {
  youth: document.querySelector("[data-teams-category='youth']"),
  adult_fun: document.querySelector("[data-teams-category='adult_fun']"),
  adult_ambitious: document.querySelector("[data-teams-category='adult_ambitious']"),
};
const teamsSubPanels = {
  youth: document.getElementById("teams-category-youth"),
  adult_fun: document.getElementById("teams-category-adult-fun"),
  adult_ambitious: document.getElementById("teams-category-adult-ambitious"),
};
let selectedTeamsCategory = "youth";

function setTeamsCategory(category) {
  selectedTeamsCategory = category;
  Object.entries(teamsSubPanels).forEach(([key, panel]) => {
    if (!panel) return;
    panel.hidden = key !== category;
  });
  Object.entries(teamsSubButtons).forEach(([key, button]) => {
    if (!button) return;
    const active = key === category;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const btn = target.closest("[data-teams-category]");
  if (!btn) return;
  event.preventDefault();
  const category = btn.getAttribute("data-teams-category");
  if (category) setTeamsCategory(category);
});


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
  // Beim erstmaligen Anzeigen des Org-Panels (oder nach erneutem Wechsel
  // zurück) waren die Spaltenbreiten u.U. mit ausgeblendetem Panel berechnet
  // worden – getBoundingClientRect() liefert dann 0 und das Grid kollabiert
  // auf die Puffer-Breite. Jetzt, wo das Panel sichtbar ist, holen wir die
  // Messung nach, damit gleich beim ersten Ausklappen alles korrekt sitzt.
  if (showOrg) applyOrgColumnWidths();
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
  syncRanglisteTilesUI();
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
function syncRanglisteTilesUI() {
  ranglisteCategoryTiles.forEach((tile) => {
    const cat = tile.getAttribute("data-rangliste-category");
    const active = cat === selectedRanglisteCategory;
    tile.classList.toggle("is-active", active);
    tile.setAttribute("aria-pressed", String(active));
  });
}

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
    if (ranglisteFinaleTop3Section) ranglisteFinaleTop3Section.hidden = true;
    return;
  }

  const finalRanking = getFinalRanking(selectedRanglisteCategory);

  if (ranglisteFinalList) {
    const remaining = finalRanking;
    if (!remaining.length) {
      ranglisteFinalList.innerHTML = "";
    } else {
      const finalItems = remaining.map(
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
  }

  // Mittlere Tabelle: reine Gruppenphasen-Rangliste (gespielt/Punkte/Tore).
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

  // Untere Tabelle «Rangliste Finalrunde Top 3» – nur für die Jugend-Kategorie.
  if (ranglisteFinaleTop3Section) {
    const isYouth = selectedRanglisteCategory === "youth";
    ranglisteFinaleTop3Section.hidden = !isYouth;

    if (isYouth && ranglisteFinaleTop3Body) {
      const top3 = getFinalrundeTop3Standings() || [];
      const tableRows = [0, 1, 2].map((i) => {
        const entry = top3[i];
        if (!entry) {
          return `<tr><td>${i + 1}</td><td><span class="team-placeholder">noch offen</span></td><td>–</td><td>–</td><td>–</td><td>–</td><td>–</td></tr>`;
        }
        const teamLabel = entry.team
          ? escapeHtml(entry.team.name)
          : (entry.code ? escapeHtml(entry.code) : `<span class="team-placeholder">noch offen</span>`);
        return `<tr><td>${i + 1}</td><td>${teamLabel}</td><td>${entry.played}</td><td>${entry.pts}</td><td>${entry.gf}</td><td>${entry.ga}</td><td>${ratioText(entry.gf, entry.ga)}</td></tr>`;
      });
      ranglisteFinaleTop3Body.innerHTML = tableRows.join("");
    }
  }
}

function updateRanglisteVisibility() {
  const isAuth = Boolean(currentUser);
  if (ranglisteViewBtn) ranglisteViewBtn.hidden = !(isAuth || ranglistePublished);
  if (!isAuth && !ranglistePublished && ranglistePanel && !ranglistePanel.hidden) setView("infos");
  if (ranglistePublishBtn) ranglistePublishBtn.hidden = !(isAuth && !ranglistePublished);
  if (ranglisteUnpublishBtn) ranglisteUnpublishBtn.hidden = !(isAuth && ranglistePublished);
  // Hinweis "Diese Rangliste ist öffentlich sichtbar." nur für Admin
  // (eingeloggte Nutzer) sichtbar, und dort nur wenn tatsächlich
  // veröffentlicht. Für alle anderen Besucher (nicht angemeldet)
  // bleibt der Hinweis ausgeblendet.
  if (ranglistePublishedNote) ranglistePublishedNote.hidden = !(isAuth && ranglistePublished);
}

ranglisteCategoryTiles.forEach((tile) => {
  tile.addEventListener("click", () => {
    const cat = tile.getAttribute("data-rangliste-category");
    if (!cat) return;
    selectedRanglisteCategory = cat;
    syncRanglisteTilesUI();
    renderRangliste();
    commitNavigation();
  });
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
