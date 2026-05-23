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
//   • Letzter Start:       16:45 Uhr (Finals aller Kategorien)
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
  youth:           ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J9"],
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
// Alle Ambitioniert-Spiele starten um 12:12 (statt 12:00), da um 12:00 auf Feld 1
// ein Jugendspiel (J5–J6) stattfindet.
const SCHEDULE_AMBI = [
  // Vorrunde (15 Spiele) – verschoben +12 Minuten gegenüber ursprünglichem Plan
  ["a-g01", "12:12", "A1", "A6"],
  ["a-g02", "12:24", "A2", "A5"],
  ["a-g03", "12:36", "A3", "A4"],
  ["a-g04", "12:48", "A1", "A5"],
  ["a-g05", "13:00", "A6", "A4"],
  ["a-g06", "13:12", "A2", "A3"],
  ["a-g07", "13:24", "A1", "A4"],
  ["a-g08", "13:36", "A5", "A3"],
  ["a-g09", "13:48", "A6", "A2"],
  ["a-g10", "14:00", "A3", "A1"],
  ["a-g11", "14:12", "A4", "A2"],
  ["a-g12", "14:24", "A5", "A6"],
  ["a-g13", "14:36", "A2", "A1"],
  ["a-g14", "14:48", "A3", "A6"],
  ["a-g15", "15:00", "A4", "A5"],
].map(([id, time, h, a]) => makeEntry({
  id, time, field: "1", category: "adult_ambitious",
  phase: "RoundRobin", phaseKind: "group",
  home: { code: h }, away: { code: a },
}));

const SCHEDULE_AMBI_FINALS = [
  makeEntry({
    id: "a-qtop", time: "15:12", field: "1", category: "adult_ambitious",
    phase: "Zwischenrunde 1", phaseKind: "quali",
    home: { rank: 1 }, away: { rank: 2 },
  }),
  makeEntry({
    id: "a-q1", time: "15:24", field: "1", category: "adult_ambitious",
    phase: "Zwischenrunde 2", phaseKind: "quali",
    home: { rank: 3 }, away: { rank: 6 },
  }),
  makeEntry({
    id: "a-q2", time: "15:36", field: "1", category: "adult_ambitious",
    phase: "Zwischenrunde 3", phaseKind: "quali",
    home: { rank: 4 }, away: { rank: 5 },
  }),
  makeEntry({
    id: "a-quali1", time: "15:48", field: "1", category: "adult_ambitious",
    phase: "Halbfinal 1", phaseKind: "semifinal",
    home: { winnerOf: "a-qtop" }, away: { winnerOf: "a-q2" },
  }),
  makeEntry({
    id: "a-quali2", time: "16:00", field: "1", category: "adult_ambitious",
    phase: "Halbfinal 2", phaseKind: "semifinal",
    home: { loserOf: "a-qtop" }, away: { winnerOf: "a-q1" },
  }),
  // Ab hier 15-Minuten-Slots (13 Min Spielzeit + 2 Min Pause).
  makeEntry({
    id: "a-p5", time: "16:15", field: "1", category: "adult_ambitious",
    phase: "Spiel um Rang 5", phaseKind: "placement",
    home: { loserOf: "a-q1" }, away: { loserOf: "a-q2" },
  }),
  makeEntry({
    id: "a-p3", time: "16:30", field: "1", category: "adult_ambitious",
    phase: "Spiel um Rang 3", phaseKind: "placement",
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
// dazu Halbfinals, Spiel um Rang 3 und Finale auf Feld 2.
//
// Block-Struktur Feld 2:
//   12:00–13:00  Plausch 1. Round-Robin komplett (6 Spiele)
//   13:12–13:48  1. Juniorenblock (4 Spiele)
//   14:00–15:00  Plausch 2. Round-Robin komplett (6 Spiele)
//   15:12–15:48  2. Juniorenblock (4 Spiele + 1 Playoff)
//   16:00–16:45  Plausch-Finalrunde
const SCHEDULE_PLAUSCH = [
  ["p-g01", "12:00", "P1", "P2"],
  ["p-g02", "12:12", "P4", "P3"],
  ["p-g03", "12:24", "P3", "P1"],
  ["p-g04", "12:36", "P2", "P4"],
  ["p-g05", "12:48", "P1", "P4"],
  ["p-g06", "13:00", "P2", "P3"],
  ["p-g07", "14:00", "P2", "P1"],
  ["p-g08", "14:12", "P4", "P3"],
  ["p-g09", "14:24", "P3", "P1"],
  ["p-g10", "14:36", "P4", "P2"],
  ["p-g11", "14:48", "P3", "P2"],
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
    phase: "Spiel um Rang 3", phaseKind: "placement",
    home: { loserOf: "p-hf1" }, away: { loserOf: "p-hf2" },
  }),
  makeEntry({
    id: "p-fin", time: "16:45", field: "2", category: "adult_fun",
    phase: "Finale", phaseKind: "final",
    home: { winnerOf: "p-hf1" }, away: { winnerOf: "p-hf2" },
  }),
];

// ── Feld 1 (Einzel): Jugend 12:00 ────────────────────────────────────────────
// Einziges Jugendspiel auf Feld 1: J5–J6 um 12:00, bevor Ambitioniert um 12:12 startet.
const SCHEDULE_YOUTH_F1 = [
  makeEntry({
    id: "j-g00", time: "12:00", field: "1", category: "youth",
    phase: "RoundRobin", phaseKind: "group",
    home: { code: "J5" }, away: { code: "J6" },
  }),
];

// ── Feld 3: Jugend (durchgehend) ─────────────────────────────────────────────
// 19 Vorrundenspiele auf Feld 3 (J1–J9, 9 Teams).
// Das erste Spiel auf Feld 3 beginnt um 12:00 gleichzeitig mit dem Jugendspiel
// auf Feld 1 (j-g00).
// Resultatverantwortung: Das erstgenannte Team (home) ist beim nächsten Spiel
// auf dem Feld fürs Zählen und das Abgeben des Resultatzettels verantwortlich.
// Die Reihenfolge (home/away) wurde so gewählt, dass die Pflicht möglichst
// gleichmässig verteilt ist und keine logischen Konflikte entstehen
// (Zählpflicht-Team spielt nicht gleichzeitig auf einem anderen Feld):
//
//   Zählpflichten F3 (19) + F2 (7) = 26 total:
//   J1: 3×  J2: 3×  J3: 3×  J4: 3×  J5: 3×
//   J6: 3×  J7: 3×  J8: 2×  J9: 3×
const SCHEDULE_YOUTH_F3 = [
  ["j-g01", "12:00", "J9", "J4"],   // war J4–J9
  ["j-g02", "12:12", "J1", "J2"],
  ["j-g03", "12:24", "J7", "J3"],   // war J3–J7
  ["j-g04", "12:36", "J5", "J8"],
  ["j-g05", "12:48", "J2", "J4"],
  ["j-g06", "13:00", "J9", "J6"],   // war J6–J9
  ["j-g07", "13:12", "J5", "J1"],   // war J1–J5
  ["j-g08", "13:24", "J3", "J9"],
  ["j-g09", "13:36", "J1", "J8"],
  ["j-g10", "13:48", "J3", "J4"],
  ["j-g11", "14:00", "J6", "J7"],
  ["j-g12", "14:12", "J2", "J3"],
  ["j-g13", "14:24", "J4", "J7"],
  ["j-g14", "14:36", "J1", "J3"],
  ["j-g15", "14:48", "J8", "J9"],
  ["j-g16", "15:00", "J6", "J1"],   // war J1–J6
  ["j-g17", "15:12", "J3", "J5"],
  ["j-g18", "15:24", "J4", "J1"],   // war J1–J4
  ["j-g19", "15:36", "J6", "J8"],
].map(([id, time, h, a]) => makeEntry({
  id, time, field: "3", category: "youth",
  phase: "RoundRobin", phaseKind: "group",
  home: { code: h }, away: { code: a },
}));

// Feld 2 Jugend-Blöcke (Netzhöhen-Wechsel nötig) – 7 Vorrundenspiele in zwei Blöcken:
//   Block 1: 13:12–13:48 (4 Spiele)
//   Block 2: 15:12–15:36 (3 Spiele)
const SCHEDULE_YOUTH_F2 = [
  ["j-g21", "13:12", "J8", "J2"],   // war J2–J8
  ["j-g22", "13:24", "J4", "J6"],
  ["j-g23", "13:36", "J7", "J2"],   // war J2–J7
  ["j-g24", "13:48", "J9", "J5"],   // war J5–J9 (Pflicht-Korrektur: J5 spielte gleichzeitig auf F3)
  ["j-g25", "15:12", "J7", "J8"],
  ["j-g26", "15:24", "J2", "J9"],
  ["j-g27", "15:36", "J5", "J7"],
].map(([id, time, h, a]) => makeEntry({
  id, time, field: "2", category: "youth",
  phase: "RoundRobin", phaseKind: "group",
  home: { code: h }, away: { code: a },
}));

// Jugend-Finalspiele (9 Teams):
//   15:48 – Spiel um Rang 8 (Feld 2) + Finalrunde Top 3 Spiel 1 (Feld 3)
//   16:00 – Spiel um Rang 6 (Feld 3)
//   16:15 – Finalrunde Top 3 Spiel 2 (Feld 3)
//   16:30 – Spiel um Rang 4 (Feld 3)
//   16:45 – Finalrunde Top 3 Spiel 3 / Finale (Feld 3)
const SCHEDULE_YOUTH_FINALS = [
  makeEntry({
    id: "j-p8", time: "15:48", field: "2", category: "youth",
    phase: "Spiel um Rang 8", phaseKind: "placement",
    home: { rank: 8 }, away: { rank: 9 },
  }),
  makeEntry({
    id: "j-fr1", time: "15:48", field: "3", category: "youth",
    phase: "Finalrunde Top 3", phaseKind: "final",
    home: { rank: 1 }, away: { rank: 3 },
  }),
  // Ab hier 15-Minuten-Slots (13 Min Spielzeit + 2 Min Pause).
  makeEntry({
    id: "j-p6", time: "16:00", field: "3", category: "youth",
    phase: "Spiel um Rang 6", phaseKind: "placement",
    home: { rank: 6 }, away: { rank: 7 },
  }),
  makeEntry({
    id: "j-fr2", time: "16:15", field: "3", category: "youth",
    phase: "Finalrunde Top 3", phaseKind: "final",
    home: { rank: 2 }, away: { rank: 3 },
  }),
  makeEntry({
    id: "j-p4", time: "16:30", field: "3", category: "youth",
    phase: "Spiel um Rang 4", phaseKind: "placement",
    home: { rank: 4 }, away: { rank: 5 },
  }),
  makeEntry({
    id: "j-fin", time: "16:45", field: "3", category: "youth",
    phase: "Finalrunde Top 3", phaseKind: "final",
    home: { rank: 1 }, away: { rank: 2 },
  }),
];

// Vollständiger Spielplan – sortiert nach Zeit, dann Feld.
export const TOURNAMENT_SCHEDULE = [
  ...SCHEDULE_AMBI,
  ...SCHEDULE_AMBI_FINALS,
  ...SCHEDULE_PLAUSCH,
  ...SCHEDULE_PLAUSCH_FINALS,
  ...SCHEDULE_YOUTH_F1,
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

// ── Netzhöhen-Wechsel über alle Felder ───────────────────────────────────────
// Erkennt Netzhöhen-Wechsel auf jedem Feld separat.
// Neben den vier Wechseln auf Feld 2 gibt es auch auf Feld 1 einen Wechsel
// um 12:12, wenn nach dem Jugend-Auftaktspiel (j-g00, Jugend-Höhe) die
// Ambitioniert-Runde beginnt (Erwachsenen-Höhe).
// Gibt eine Map matchId → { field, from, to } zurück.
export function getAllNetSwitches() {
  const fields = [...new Set(TOURNAMENT_SCHEDULE.map((m) => m.field))];
  const switches = new Map();
  for (const field of fields) {
    const matches = TOURNAMENT_SCHEDULE
      .filter((m) => m.field === field)
      .sort((a, b) => a.time.localeCompare(b.time));
    let prev = null;
    for (const m of matches) {
      if (prev !== null && m.netHeight !== prev) {
        switches.set(m.id, { field, from: prev, to: m.netHeight });
      }
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
