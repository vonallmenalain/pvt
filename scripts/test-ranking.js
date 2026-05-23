#!/usr/bin/env node
/**
 * Automated tests for the tournament ranking logic.
 *
 * Tested scenarios:
 *  1. Youth group-3 team wins all Finalrunde games → earns rank 1 overall
 *  2. Circular wins with equal points → tiebreaker order:
 *     pts > Anzahl Siege > Anzahl erspielte Punkte > Punkteverhältnis > code
 *
 * These tests are pure-JS and need no browser / Firebase: they recreate the
 * relevant logic functions and drive them with mock data.
 */

"use strict";

// ── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  const ok = actual === expected;
  if (ok) {
    console.log(`  ✓ ${message} (got: ${JSON.stringify(actual)})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── Pure ranking logic (mirrors app-teams.js) ─────────────────────────────

/**
 * Sort comparator implementing the official tiebreaker rules:
 *   1. Punkte (match points: win=2, draw=1, loss=0)
 *   2. Anzahl Siege
 *   3. Anzahl erspielte Punkte (gf)
 *   4. Punkteverhältnis (gf/ga)
 *   5. Code (proxy for Los)
 */
function standingsSort(a, b) {
  if (b.pts !== a.pts) return b.pts - a.pts;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.gf !== a.gf) return b.gf - a.gf;
  const ratioA = a.ga === 0 ? (a.gf > 0 ? Infinity : 0) : a.gf / a.ga;
  const ratioB = b.ga === 0 ? (b.gf > 0 ? Infinity : 0) : b.gf / b.ga;
  if (ratioB !== ratioA) return ratioB - ratioA;
  return a.code.localeCompare(b.code);
}

/**
 * Compute round-robin stats for a set of teams from a list of match results.
 * Each result: { home: code, away: code, scoreHome: number, scoreAway: number }
 *
 * Returns array of { code, pts, wins, gf, ga, played } sorted by standingsSort.
 */
function computeRoundRobinStandings(teamCodes, results) {
  const statsMap = {};
  for (const code of teamCodes) statsMap[code] = { code, pts: 0, wins: 0, gf: 0, ga: 0, played: 0 };

  for (const { home, away, scoreHome, scoreAway } of results) {
    if (statsMap[home] !== undefined) {
      statsMap[home].played++;
      statsMap[home].gf += scoreHome;
      statsMap[home].ga += scoreAway;
      if (scoreHome > scoreAway) { statsMap[home].pts += 2; statsMap[home].wins++; }
      else if (scoreHome === scoreAway) statsMap[home].pts += 1;
    }
    if (statsMap[away] !== undefined) {
      statsMap[away].played++;
      statsMap[away].gf += scoreAway;
      statsMap[away].ga += scoreHome;
      if (scoreAway > scoreHome) { statsMap[away].pts += 2; statsMap[away].wins++; }
      else if (scoreHome === scoreAway) statsMap[away].pts += 1;
    }
  }

  return Object.values(statsMap).sort(standingsSort);
}

// ── Test suite 1: Youth rank-3 wins all Finalrunde games → rank 1 ──────────

console.log("\n=== Test suite 1: Group-3 team wins all Finalrunde matches ===");

/*
 * Setup:
 *   Group phase order: J1 (rank 1), J2 (rank 2), J3 (rank 3)
 *
 *   Finalrunde schedule (round-robin):
 *     j-fr1: J1 (rank 1) vs J3 (rank 3) → J3 wins  (e.g. 5:15)
 *     j-fr2: J2 (rank 2) vs J3 (rank 3) → J3 wins  (e.g. 7:18)
 *     j-fin: J1 (rank 1) vs J2 (rank 2) → J1 wins  (e.g. 21:10)
 *
 *   Expected Finalrunde standings:
 *     1. J3 — 4 pts (2 wins)
 *     2. J1 — 2 pts (1 win)
 *     3. J2 — 0 pts (0 wins)
 *
 *   Expected final ranking positions: J3 = 1st, J1 = 2nd, J2 = 3rd
 */
{
  const finalrundeResults = [
    { home: "J1", away: "J3", scoreHome:  5, scoreAway: 15 }, // J3 wins
    { home: "J2", away: "J3", scoreHome:  7, scoreAway: 18 }, // J3 wins
    { home: "J1", away: "J2", scoreHome: 21, scoreAway: 10 }, // J1 wins
  ];

  const top3 = computeRoundRobinStandings(["J1", "J2", "J3"], finalrundeResults);

  assertEqual(top3[0].code, "J3", "Rank 1 in Finalrunde is J3 (group rank 3, won all games)");
  assertEqual(top3[0].pts,  4,    "J3 has 4 Finalrunde points");
  assertEqual(top3[0].wins, 2,    "J3 has 2 wins");
  assertEqual(top3[1].code, "J1", "Rank 2 in Finalrunde is J1");
  assertEqual(top3[1].pts,  2,    "J1 has 2 Finalrunde points");
  assertEqual(top3[2].code, "J2", "Rank 3 in Finalrunde is J2");
  assertEqual(top3[2].pts,  0,    "J2 has 0 Finalrunde points");
}

// ── Test suite 2: Circular wins, equal points – tiebreaker logic ──────────

console.log("\n=== Test suite 2: Circular wins – equal points, tiebreakers apply ===");

/*
 * Setup (3-team round-robin, each team wins exactly once):
 *   A beats B: 21:10
 *   B beats C: 21:10
 *   C beats A: 21:10
 *
 *   All teams: 2 pts, 1 win
 *   Tiebreaker 1 (pts):  all equal → no decision
 *   Tiebreaker 2 (wins): all equal (1 win each) → no decision
 *   Tiebreaker 3 (gf):   all 21 → no decision
 *   Tiebreaker 4 (ratio):all 21/10 = 2.1 → no decision
 *   Tiebreaker 5 (code): A < B < C → A=1st, B=2nd, C=3rd
 */
{
  const results = [
    { home: "A", away: "B", scoreHome: 21, scoreAway: 10 },
    { home: "B", away: "C", scoreHome: 21, scoreAway: 10 },
    { home: "C", away: "A", scoreHome: 21, scoreAway: 10 },
  ];

  const standings = computeRoundRobinStandings(["A", "B", "C"], results);

  // All teams must have 2 pts and 1 win
  // Each team plays 2 games: wins one (scores 21, concedes 10) and loses one
  // (scores 10, concedes 21) → gf = 31, ga = 31 per team.
  assert(standings.every(s => s.pts === 2),  "All teams have 2 points");
  assert(standings.every(s => s.wins === 1), "All teams have 1 win");
  assert(standings.every(s => s.gf === 31),  "All teams scored 31 points (21+10)");
  assert(standings.every(s => s.ga === 31),  "All teams conceded 31 points (10+21)");

  // Final order falls back to code (proxy for Los)
  assertEqual(standings[0].code, "A", "Tiebreak by code: A comes first");
  assertEqual(standings[1].code, "B", "Tiebreak by code: B comes second");
  assertEqual(standings[2].code, "C", "Tiebreak by code: C comes third");
}

// ── Test suite 3: Equal pts, wins differ ──────────────────────────────────

console.log("\n=== Test suite 3: Equal points, different wins ===");

/*
 * Two teams, each with 2 match-points but earned differently:
 *   X: 1 win (2pts), 0 draws
 *   Y: 0 wins, 2 draws (2pts)
 *
 * Expected: X ranked above Y (more wins)
 */
{
  // We simulate directly (no match needed between X and Y for this unit test)
  const rows = [
    { code: "X", pts: 2, wins: 1, gf: 15, ga: 10, played: 1 },
    { code: "Y", pts: 2, wins: 0, gf: 15, ga: 10, played: 2 },
  ].sort(standingsSort);

  assertEqual(rows[0].code, "X", "X ranked above Y because X has 1 win vs Y has 0 wins");
  assertEqual(rows[1].code, "Y", "Y ranked second");
}

// ── Test suite 4: Equal pts & wins, different gf ──────────────────────────

console.log("\n=== Test suite 4: Equal pts & wins, different gf (Anzahl erspielte Punkte) ===");

{
  const rows = [
    { code: "P", pts: 2, wins: 1, gf: 10, ga: 5, played: 1 },
    { code: "Q", pts: 2, wins: 1, gf: 15, ga: 8, played: 1 },
  ].sort(standingsSort);

  assertEqual(rows[0].code, "Q", "Q ranked above P because Q has more gf (15 vs 10)");
}

// ── Test suite 5: Equal pts, wins & gf, different ratio ──────────────────

console.log("\n=== Test suite 5: Equal pts, wins & gf, different ratio (Punkteverhältnis) ===");

{
  const rows = [
    { code: "R", pts: 2, wins: 1, gf: 15, ga: 12, played: 1 }, // ratio ≈ 1.25
    { code: "S", pts: 2, wins: 1, gf: 15, ga:  8, played: 1 }, // ratio ≈ 1.875
  ].sort(standingsSort);

  assertEqual(rows[0].code, "S", "S ranked above R because S has better ratio (15/8 vs 15/12)");
}

// ── Test suite 6: Group-phase tiebreaker in a circular 9-team scenario ───

console.log("\n=== Test suite 6: Group-phase circular tiebreak (wins first, then gf, then ratio) ===");

/*
 * Three teams in a group with equal match-points but different win/draw mix:
 *   Alpha: 2 wins, 0 draws, 2 losses → 4 pts
 *   Beta:  2 wins, 0 draws, 2 losses → 4 pts
 *   Gamma: 2 wins, 0 draws, 2 losses → 4 pts
 *
 * All have same pts and wins. Alpha has more gf than Beta (and same ratio):
 * Alpha scores 20 pts per win, Beta scores 15 pts per win → Alpha ranked higher.
 */
{
  const rows = [
    { code: "Alpha", pts: 4, wins: 2, gf: 40, ga: 30, played: 4 }, // ratio ≈ 1.33
    { code: "Beta",  pts: 4, wins: 2, gf: 30, ga: 30, played: 4 }, // ratio = 1.00
    { code: "Gamma", pts: 4, wins: 2, gf: 30, ga: 20, played: 4 }, // ratio = 1.50
  ].sort(standingsSort);

  // Same pts, same wins. Tiebreaker: gf
  // Alpha (40) > Gamma (30) = Beta (30) → gf breaks Alpha vs the rest
  assertEqual(rows[0].code, "Alpha", "Alpha first (most gf)");
  // Among Gamma and Beta: same pts, wins, gf → ratio: Gamma (1.5) > Beta (1.0)
  assertEqual(rows[1].code, "Gamma", "Gamma second (better ratio than Beta)");
  assertEqual(rows[2].code, "Beta",  "Beta third (worst ratio)");
}

// ── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("All tests passed.");
}
