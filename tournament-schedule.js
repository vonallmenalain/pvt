// ─────────────────────────────────────────────────────────────────────────────
// Pfahlvolleyballturnier 2026 – zentraler Spielplan
//
// Diese Datei enthält den vollständigen Turnierplan als einzige Quelle der
// Wahrheit. Alle Views (Spielplan, Dashboard, Organisation, Rangliste) leiten
// ihre Daten aus dieser Struktur ab.
//
// Format-Eckdaten:
//   • Turnierstart:        12:00 Uhr
//   • Slotdauer Vorrunde:  12 Min (10 Min Spiel + 2 Min Pause/Wechsel)
//                          → gilt für alle Slots bis und mit 15:48
//   • Slotdauer Finalrunde: 15 Min (13 Min Spiel + 2 Min Pause/Wechsel)
//                          → gilt für alle Slots ab 16:00
//   • Letzter Start:       16:45 Uhr (Finals aller drei Turniere)
//   • 3 Felder:            Feld 1 (Ambitioniert), Feld 2 (Plausch+Jugend), Feld 3 (Jugend)
// ─────────────────────────────────────────────────────────────────────────────

export const CATEGORY_LABELS = {
  adult_ambitious: "Erwachsene Ambitioniert",
  adult_fun: "Erwachsene Plausch",
  youth: "Jugendliche",
};

export const CATEGORY_SHORT_LABELS = {
  adult_ambitious: "Ambitioniert",
  adult_fun: "Plausch",
  youth: "Jugend",
};

// Kürzel je Kategorie (A/P/J) – wird im Spielplan vor den Phasennamen
// gesetzt, z.B. "A - RoundRobin" oder "J - Finale".
export const CATEGORY_PREFIX = {
  adult_ambitious: "A",
  adult_fun: "P",
  youth: "J",
};

export const CATEGORY_COLORS = {
  adult_ambitious: { bg: "rgba(255, 167, 38, 0.18)", border: "#ffa726", text: "#ffd28a" },
  adult_fun:       { bg: "rgba(102, 187, 106, 0.18)", border: "#66bb6a", text: "#aee0b0" },
  youth:           { bg: "rgba(92, 107, 192, 0.22)",  border: "#7986cb", text: "#c5cae9" },
};

// Spielcodes je Kategorie. Reihenfolge dient als kanonische Rang-Reihenfolge.
export const CATEGORY_CODES = {
  adult_ambitious: ["A1", "A2", "A3", "A4", "A5", "A6"],
  adult_fun:       ["P1", "P2", "P3", "P4"],
  youth:           ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8"],
};

// Zuordnung Code → Kategorie (für Validierung / Anzeige)
export const CODE_TO_CATEGORY = Object.entries(CATEGORY_CODES).reduce((acc, [cat, codes]) => {
  codes.forEach((code) => { acc[code] = cat; });
  return acc;
}, {});

export const PHASE_KINDS = {
  group: "RoundRobin",
  quali: "Zwischenrunde",
  semifinal: "Halbfinal",
  placement: "Platzierung",
  final: "Finale",
};

// Netzhöhe je Match: 'youth' (tiefer) oder 'adult' (normal).
// Wird aus category abgeleitet: youth → youth, sonst → adult.
function netHeightFor(category) {
  return category === "youth" ? "youth" : "adult";
}

// Spielzeit eines Slots in Minuten.
// Bis und mit 15:48 gelten 10-Minuten-Spiele (12-Minuten-Slots inkl. Pause).
// Ab 16:00 startet die Finalrunde mit 13-Minuten-Spielen (15-Minuten-Slots).
function playMinutesFor(time) {
  return time >= "16:00" ? 13 : 10;
}

// Endzeit eines Slots = Start + Spielzeit.
function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function makeEntry({ id, time, field, category, phase, phaseKind, home, away }) {
  return {
    id,
    time,
    endTime: addMinutes(time, playMinutesFor(time)),
    field,
    category,
    phase,
    phaseKind,
    netHeight: netHeightFor(category),
    home, away,
    isPlayoff: phaseKind !== "group",
  };
}

// ── Feld 1: Erwachsene Ambitioniert ──────────────────────────────────────────
// 15 Vorrundenspiele (Round-Robin) + Zwischenrunde + Quali + Platzierungs-/Finalspiele
const SCHEDULE_AMBI = [
  // Vorrunde (15 Spiele)
  ["a-g01", "12:00", "A1", "A6"],
  ["a-g02", "12:12", "A2", "A5"],
  ["a-g03", "12:24", "A3", "A4"],
  ["a-g04", "12:36", "A1", "A5"],
  ["a-g05", "12:48", "A6", "A4"],
  ["a-g06", "13:00", "A2", "A3"],
  ["a-g07", "13:12", "A1", "A4"],
  ["a-g08", "13:24", "A5", "A3"],
  ["a-g09", "13:36", "A6", "A2"],
  ["a-g10", "13:48", "A1", "A3"],
  ["a-g11", "14:00", "A4", "A2"],
  ["a-g12", "14:12", "A5", "A6"],
  ["a-g13", "14:24", "A1", "A2"],
  ["a-g14", "14:36", "A3", "A6"],
  ["a-g15", "14:48", "A4", "A5"],
].map(([id, time, h, a]) => makeEntry({
  id, time, field: "1", category: "adult_ambitious",
  phase: "RoundRobin", phaseKind: "group",
  home: { code: h }, away: { code: a },
}));

const SCHEDULE_AMBI_FINALS = [
  makeEntry({
    id: "a-qtop", time: "15:00", field: "1", category: "adult_ambitious",
    phase: "Zwischenrunde 1", phaseKind: "quali",
    home: { rank: 1 }, away: { rank: 2 },
  }),
  makeEntry({
    id: "a-q1", time: "15:12", field: "1", category: "adult_ambitious",
    phase: "Zwischenrunde 2", phaseKind: "quali",
    home: { rank: 3 }, away: { rank: 6 },
  }),
  makeEntry({
    id: "a-q2", time: "15:24", field: "1", category: "adult_ambitious",
    phase: "Zwischenrunde 3", phaseKind: "quali",
    home: { rank: 4 }, away: { rank: 5 },
  }),
  makeEntry({
    id: "a-quali1", time: "15:36", field: "1", category: "adult_ambitious",
    phase: "Halbfinal 1", phaseKind: "semifinal",
    home: { winnerOf: "a-qtop" }, away: { winnerOf: "a-q2" },
  }),
  makeEntry({
    id: "a-quali2", time: "15:48", field: "1", category: "adult_ambitious",
    phase: "Halbfinal 2", phaseKind: "semifinal",
    home: { loserOf: "a-qtop" }, away: { winnerOf: "a-q1" },
  }),
  // Ab hier 15-Minuten-Slots (13 Min Spielzeit + 2 Min Pause).
  // 16:15 bleibt auf Feld 1 bewusst frei (Puffer / Finalvorbereitung).
  makeEntry({
    id: "a-p5", time: "16:00", field: "1", category: "adult_ambitious",
    phase: "Spiel um Platz 5", phaseKind: "placement",
    home: { loserOf: "a-q1" }, away: { loserOf: "a-q2" },
  }),
  makeEntry({
    id: "a-p3", time: "16:30", field: "1", category: "adult_ambitious",
    phase: "Spiel um Platz 3", phaseKind: "placement",
    home: { loserOf: "a-quali1" }, away: { loserOf: "a-quali2" },
  }),
  makeEntry({
    id: "a-fin", time: "16:45", field: "1", category: "adult_ambitious",
    phase: "Finale", phaseKind: "final",
    home: { winnerOf: "a-quali1" }, away: { winnerOf: "a-quali2" },
  }),
];

// ── Feld 2: Erwachsene Plausch + Jugend-Blöcke ───────────────────────────────
// 12 Vorrundenspiele Plausch (Doppel-Round-Robin) auf Feld 2,
// dazu Halbfinals, Spiel um Platz 3 und Finale auf Feld 2.
//
// Block-Struktur Feld 2:
//   12:00–13:00  Plausch 1. Round-Robin komplett (6 Spiele)
//   13:12–13:48  1. Juniorenblock (4 Spiele)
//   14:00–15:00  Plausch 2. Round-Robin komplett (6 Spiele)
//   15:12–15:48  2. Juniorenblock (4 Spiele)
//   16:00–16:45  Plausch-Finalrunde
const SCHEDULE_PLAUSCH = [
  ["p-g01", "12:00", "P1", "P2"],
  ["p-g02", "12:12", "P3", "P4"],
  ["p-g03", "12:24", "P1", "P3"],
  ["p-g04", "12:36", "P2", "P4"],
  ["p-g05", "12:48", "P1", "P4"],
  ["p-g06", "13:00", "P2", "P3"],
  ["p-g07", "14:00", "P1", "P2"],
  ["p-g08", "14:12", "P3", "P4"],
  ["p-g09", "14:24", "P1", "P3"],
  ["p-g10", "14:36", "P2", "P4"],
  ["p-g11", "14:48", "P2", "P3"],
  ["p-g12", "15:00", "P1", "P4"],
].map(([id, time, h, a]) => makeEntry({
  id, time, field: "2", category: "adult_fun",
  phase: "RoundRobin", phaseKind: "group",
  home: { code: h }, away: { code: a },
}));

const SCHEDULE_PLAUSCH_FINALS = [
  makeEntry({
    id: "p-hf1", time: "16:00", field: "2", category: "adult_fun",
    phase: "Halbfinal 1", phaseKind: "semifinal",
    home: { rank: 1 }, away: { rank: 4 },
  }),
  makeEntry({
    id: "p-hf2", time: "16:15", field: "2", category: "adult_fun",
    phase: "Halbfinal 2", phaseKind: "semifinal",
    home: { rank: 2 }, away: { rank: 3 },
  }),
  makeEntry({
    id: "p-p3", time: "16:30", field: "2", category: "adult_fun",
    phase: "Spiel um Platz 3", phaseKind: "placement",
    home: { loserOf: "p-hf1" }, away: { loserOf: "p-hf2" },
  }),
  makeEntry({
    id: "p-fin", time: "16:45", field: "2", category: "adult_fun",
    phase: "Finale", phaseKind: "final",
    home: { winnerOf: "p-hf1" }, away: { winnerOf: "p-hf2" },
  }),
];

// ── Feld 3: Jugend (durchgehend) + Feld 2 (Block-weise) ──────────────────────
// 28 Vorrundenspiele Jugend total: 20 auf Feld 3, 8 auf Feld 2 (zwei Blöcke).
// Spiel um Platz 7, Platz 5, Platz 3 und Finale auf Feld 3.

// Feld 3 (immer Jugend-Netzhöhe) – 20 Vorrundenspiele:
// Die ersten vier Junioren-Spiele decken alle 8 Teams ab
// (J1–J2, J3–J4, J5–J6, J7–J8), danach komplettes Round-Robin.
const SCHEDULE_YOUTH_F3 = [
  ["j-g01", "12:00", "J1", "J2"],
  ["j-g02", "12:12", "J3", "J4"],
  ["j-g03", "12:24", "J5", "J6"],
  ["j-g04", "12:36", "J7", "J8"],
  ["j-g05", "12:48", "J1", "J4"],
  ["j-g06", "13:00", "J2", "J3"],
  ["j-g07", "13:12", "J5", "J7"],
  ["j-g08", "13:24", "J1", "J3"],
  ["j-g09", "13:36", "J4", "J7"],
  ["j-g10", "13:48", "J2", "J7"],
  ["j-g11", "14:00", "J1", "J8"],
  ["j-g12", "14:12", "J4", "J6"],
  ["j-g13", "14:24", "J2", "J5"],
  ["j-g14", "14:36", "J3", "J7"],
  ["j-g15", "14:48", "J1", "J6"],
  ["j-g16", "15:00", "J2", "J8"],
  ["j-g17", "15:12", "J6", "J7"],
  ["j-g18", "15:24", "J1", "J5"],
  ["j-g19", "15:36", "J6", "J8"],
  ["j-g20", "15:48", "J1", "J7"],
].map(([id, time, h, a]) => makeEntry({
  id, time, field: "3", category: "youth",
  phase: "RoundRobin", phaseKind: "group",
  home: { code: h }, away: { code: a },
}));

// Feld 2 Jugend-Blöcke (Netzhöhen-Wechsel nötig) – 8 Vorrundenspiele in zwei Blöcken:
//   Block 1: 13:12–13:48 (4 Spiele)
//   Block 2: 15:12–15:48 (4 Spiele)
const SCHEDULE_YOUTH_F2 = [
  ["j-g21", "13:12", "J4", "J8"],
  ["j-g22", "13:24", "J2", "J6"],
  ["j-g23", "13:36", "J5", "J8"],
  ["j-g24", "13:48", "J3", "J6"],
  ["j-g25", "15:12", "J4", "J5"],
  ["j-g26", "15:24", "J3", "J8"],
  ["j-g27", "15:36", "J2", "J4"],
  ["j-g28", "15:48", "J3", "J5"],
].map(([id, time, h, a]) => makeEntry({
  id, time, field: "2", category: "youth",
  phase: "RoundRobin", phaseKind: "group",
  home: { code: h }, away: { code: a },
}));

// Jugend-Finalspiele: Alle Platzierungsspiele und das Finale auf Feld 3
// (15-Minuten-Slots ab 16:00).
const SCHEDULE_YOUTH_FINALS = [
  makeEntry({
    id: "j-p7", time: "16:00", field: "3", category: "youth",
    phase: "Spiel um Platz 7", phaseKind: "placement",
    home: { rank: 7 }, away: { rank: 8 },
  }),
  makeEntry({
    id: "j-p5", time: "16:15", field: "3", category: "youth",
    phase: "Spiel um Platz 5", phaseKind: "placement",
    home: { rank: 5 }, away: { rank: 6 },
  }),
  makeEntry({
    id: "j-p3", time: "16:30", field: "3", category: "youth",
    phase: "Spiel um Platz 3", phaseKind: "placement",
    home: { rank: 3 }, away: { rank: 4 },
  }),
  makeEntry({
    id: "j-fin", time: "16:45", field: "3", category: "youth",
    phase: "Finale", phaseKind: "final",
    home: { rank: 1 }, away: { rank: 2 },
  }),
];

// Vollständiger Spielplan – sortiert nach Zeit, dann Feld.
export const TOURNAMENT_SCHEDULE = [
  ...SCHEDULE_AMBI,
  ...SCHEDULE_AMBI_FINALS,
  ...SCHEDULE_PLAUSCH,
  ...SCHEDULE_PLAUSCH_FINALS,
  ...SCHEDULE_YOUTH_F3,
  ...SCHEDULE_YOUTH_F2,
  ...SCHEDULE_YOUTH_FINALS,
].sort((a, b) => {
  if (a.time !== b.time) return a.time.localeCompare(b.time);
  return a.field.localeCompare(b.field);
});

// Alle Zeit-Slots (eindeutig, sortiert) – nützlich für die Organisations-Übersicht.
export const SCHEDULE_SLOTS = Array.from(new Set(TOURNAMENT_SCHEDULE.map((m) => m.time))).sort();

// ── Netzhöhen-Wechsel auf Feld 2 ─────────────────────────────────────────────
// Berechnet, vor welchen Field-2-Slots die Netzhöhe gewechselt werden muss.
// Ein Wechsel ist nötig, sobald ein Match auf Feld 2 eine andere Netzhöhe hat
// als das vorherige Field-2-Match (oder als initialer Default).
//
// Default-Annahme: Feld 2 startet auf Erwachsenenhöhe (erstes Match ist Plausch).
export function getField2NetSwitches() {
  const f2Matches = TOURNAMENT_SCHEDULE
    .filter((m) => m.field === "2")
    .sort((a, b) => a.time.localeCompare(b.time));
  const switches = new Map(); // matchId → { from: 'adult'|'youth', to: 'adult'|'youth' }
  let prev = "adult";
  for (const m of f2Matches) {
    if (m.netHeight !== prev) {
      switches.set(m.id, { from: prev, to: m.netHeight });
      prev = m.netHeight;
    }
  }
  return switches;
}

// Liste der zusammenhängenden Field-2-Blöcke je Netzhöhe – für die Anzeige
// in den Infos / Legenden ("Feld 2 muss von … bis … auf Jugend gestellt sein").
export function getField2Blocks() {
  const f2 = TOURNAMENT_SCHEDULE
    .filter((m) => m.field === "2")
    .sort((a, b) => a.time.localeCompare(b.time));
  const blocks = [];
  for (const m of f2) {
    const last = blocks[blocks.length - 1];
    if (last && last.netHeight === m.netHeight) {
      last.endTime = m.endTime;
      last.matches.push(m);
    } else {
      blocks.push({
        netHeight: m.netHeight,
        startTime: m.time,
        endTime: m.endTime,
        matches: [m],
      });
    }
  }
  return blocks;
}
