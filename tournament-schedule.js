// ─────────────────────────────────────────────────────────────────────────────
// Pfahlvolleyballturnier 2026 – zentraler Spielplan
//
// Diese Datei enthält den vollständigen Turnierplan als einzige Quelle der
// Wahrheit. Alle Views (Spielplan, Dashboard, Organisation, Rangliste) leiten
// ihre Daten aus dieser Struktur ab.
//
// Format-Eckdaten:
//   • Turnierstart:   11:30 Uhr
//   • Slotdauer:      15 Min (13 Min Spiel + 2 Min Pause/Wechsel)
//   • Letzter Start:  17:00 Uhr
//   • 3 Felder:       Feld 1 (Ambitioniert), Feld 2 (Plausch+Jugend), Feld 3 (Jugend)
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
  group: "Gruppe",
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

// Endzeit eines Slots = Start + 13 Min.
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
    endTime: addMinutes(time, 13),
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
// 15 Gruppenspiele (Round-Robin) + Zwischenrunde + Finalrunde
const SCHEDULE_AMBI = [
  // Gruppe (15 Spiele)
  ["a-g01", "11:30", "A1", "A6"],
  ["a-g02", "11:45", "A2", "A5"],
  ["a-g03", "12:00", "A3", "A4"],
  ["a-g04", "12:15", "A1", "A5"],
  ["a-g05", "12:30", "A6", "A4"],
  ["a-g06", "12:45", "A2", "A3"],
  ["a-g07", "13:00", "A1", "A4"],
  ["a-g08", "13:15", "A5", "A3"],
  ["a-g09", "13:30", "A6", "A2"],
  ["a-g10", "13:45", "A1", "A3"],
  ["a-g11", "14:00", "A4", "A2"],
  ["a-g12", "14:15", "A5", "A6"],
  ["a-g13", "14:30", "A1", "A2"],
  ["a-g14", "14:45", "A3", "A6"],
  ["a-g15", "15:00", "A4", "A5"],
].map(([id, time, h, a]) => makeEntry({
  id, time, field: "1", category: "adult_ambitious",
  phase: "Gruppe", phaseKind: "group",
  home: { code: h }, away: { code: a },
}));

const SCHEDULE_AMBI_FINALS = [
  makeEntry({
    id: "a-q1", time: "15:15", field: "1", category: "adult_ambitious",
    phase: "Zwischenrunde Q1", phaseKind: "quali",
    home: { rank: 3 }, away: { rank: 6 },
  }),
  makeEntry({
    id: "a-q2", time: "15:30", field: "1", category: "adult_ambitious",
    phase: "Zwischenrunde Q2", phaseKind: "quali",
    home: { rank: 4 }, away: { rank: 5 },
  }),
  makeEntry({
    id: "a-hf1", time: "15:45", field: "1", category: "adult_ambitious",
    phase: "Halbfinal 1", phaseKind: "semifinal",
    home: { rank: 1 }, away: { winnerOf: "a-q2" },
  }),
  makeEntry({
    id: "a-hf2", time: "16:00", field: "1", category: "adult_ambitious",
    phase: "Halbfinal 2", phaseKind: "semifinal",
    home: { rank: 2 }, away: { winnerOf: "a-q1" },
  }),
  makeEntry({
    id: "a-p5", time: "16:15", field: "1", category: "adult_ambitious",
    phase: "Spiel um Platz 5", phaseKind: "placement",
    home: { loserOf: "a-q1" }, away: { loserOf: "a-q2" },
  }),
  makeEntry({
    id: "a-p3", time: "16:30", field: "1", category: "adult_ambitious",
    phase: "Spiel um Platz 3", phaseKind: "placement",
    home: { loserOf: "a-hf1" }, away: { loserOf: "a-hf2" },
  }),
  makeEntry({
    id: "a-fin", time: "16:45", field: "1", category: "adult_ambitious",
    phase: "Finale", phaseKind: "final",
    home: { winnerOf: "a-hf1" }, away: { winnerOf: "a-hf2" },
  }),
];

// ── Feld 2: Erwachsene Plausch (überwiegend) ─────────────────────────────────
// 12 Gruppenspiele (Doppel-Round-Robin) + HFs + Finale auf Feld 2,
// Spiel um Platz 3 zusätzlich auf Feld 1 um 17:00.
const SCHEDULE_PLAUSCH = [
  ["p-g01", "11:30", "P1", "P4"],
  ["p-g02", "11:45", "P2", "P3"],
  ["p-g03", "12:00", "P1", "P3"],
  ["p-g04", "12:15", "P4", "P2"],
  ["p-g05", "12:30", "P1", "P2"],
  ["p-g06", "13:30", "P3", "P4"],
  ["p-g07", "13:45", "P4", "P1"],
  ["p-g08", "14:00", "P3", "P2"],
  ["p-g09", "14:15", "P3", "P1"],
  ["p-g10", "14:30", "P2", "P4"],
  ["p-g11", "16:00", "P2", "P1"],
  ["p-g12", "16:15", "P4", "P3"],
].map(([id, time, h, a]) => makeEntry({
  id, time, field: "2", category: "adult_fun",
  phase: "Gruppe", phaseKind: "group",
  home: { code: h }, away: { code: a },
}));

const SCHEDULE_PLAUSCH_FINALS = [
  makeEntry({
    id: "p-hf1", time: "16:30", field: "2", category: "adult_fun",
    phase: "Halbfinal 1", phaseKind: "semifinal",
    home: { rank: 1 }, away: { rank: 4 },
  }),
  makeEntry({
    id: "p-hf2", time: "16:45", field: "2", category: "adult_fun",
    phase: "Halbfinal 2", phaseKind: "semifinal",
    home: { rank: 2 }, away: { rank: 3 },
  }),
  // Plausch-Spiel um Platz 3 läuft parallel zum Plausch-Finale auf Feld 1.
  makeEntry({
    id: "p-p3", time: "17:00", field: "1", category: "adult_fun",
    phase: "Spiel um Platz 3", phaseKind: "placement",
    home: { loserOf: "p-hf1" }, away: { loserOf: "p-hf2" },
  }),
  makeEntry({
    id: "p-fin", time: "17:00", field: "2", category: "adult_fun",
    phase: "Finale", phaseKind: "final",
    home: { winnerOf: "p-hf1" }, away: { winnerOf: "p-hf2" },
  }),
];

// ── Feld 3: Jugend (durchgehend) + Feld 2 (Block-weise) ──────────────────────
// 28 Gruppenspiele (volles Round-Robin) + Spiel um Platz 3 + Finale auf Feld 3.
// Field 3 (always youth) – 20 Gruppenspiele:
const SCHEDULE_YOUTH_F3 = [
  ["j-g01", "11:30", "J1", "J8"],
  ["j-g02", "11:45", "J2", "J7"],
  ["j-g03", "12:00", "J3", "J6"],
  ["j-g04", "12:15", "J4", "J5"],
  ["j-g05", "12:30", "J1", "J7"],
  ["j-g06", "12:45", "J2", "J5"],
  ["j-g07", "13:00", "J1", "J6"],
  ["j-g08", "13:15", "J8", "J4"],
  ["j-g09", "13:30", "J2", "J3"],
  ["j-g10", "13:45", "J1", "J5"],
  ["j-g11", "14:00", "J6", "J4"],
  ["j-g12", "14:15", "J7", "J3"],
  ["j-g13", "14:30", "J8", "J2"],
  ["j-g14", "14:45", "J1", "J4"],
  ["j-g15", "15:00", "J6", "J2"],
  ["j-g16", "15:15", "J1", "J3"],
  ["j-g17", "15:30", "J5", "J8"],
  ["j-g19", "15:45", "J1", "J2"],
  ["j-g21", "16:00", "J4", "J7"],
  ["j-g22", "16:15", "J5", "J6"],
].map(([id, time, h, a]) => makeEntry({
  id, time, field: "3", category: "youth",
  phase: "Gruppe", phaseKind: "group",
  home: { code: h }, away: { code: a },
}));

// Field 2 youth blocks (Netzhöhen-Wechsel nötig) – 8 Gruppenspiele in zwei Blöcken:
//   Block 1: 12:45–13:15 (3 Spiele)
//   Block 2: 14:45–15:45 (5 Spiele)
const SCHEDULE_YOUTH_F2 = [
  ["j-g23", "12:45", "J8", "J6"],
  ["j-g24", "13:00", "J3", "J4"],
  ["j-g25", "13:15", "J7", "J5"],
  ["j-g26", "14:45", "J5", "J3"],
  ["j-g27", "15:00", "J7", "J8"],
  ["j-g28", "15:15", "J4", "J2"],
  ["j-g18", "15:30", "J6", "J7"],
  ["j-g20", "15:45", "J3", "J8"],
].map(([id, time, h, a]) => makeEntry({
  id, time, field: "2", category: "youth",
  phase: "Gruppe", phaseKind: "group",
  home: { code: h }, away: { code: a },
}));

// Jugend-Finalspiele finden komplett auf Feld 3 statt (kein Spielstart nach 16:45).
const SCHEDULE_YOUTH_FINALS = [
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
