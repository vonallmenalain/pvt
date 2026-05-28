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

// ── Early rank resolution logic (mirrors getEarlyResolvedGroupRanks) ─────

/**
 * Pure reimplementation of getEarlyResolvedGroupRanks for testing.
 *
 * @param {Array<{code, pts, wins, gf, ga, played}>} standings – sorted by standingsSort
 * @param {Object} remainingPerTeam – { code: numberOfRemainingGames }
 * @returns {Map<number, string>} rank → team code (only mathematically secured ranks)
 */
function getEarlyResolvedGroupRanks(standings, remainingPerTeam) {
  const resolved = new Map();

  for (let i = 0; i < standings.length; i++) {
    const team = standings[i];
    const myMax = team.pts + 2 * (remainingPerTeam[team.code] || 0);
    const myRemaining = remainingPerTeam[team.code] || 0;

    const definitelyAbove = standings.filter((o, j) => {
      if (j === i) return false;
      if (o.pts > myMax) return true;
      if (myRemaining === 0 && (remainingPerTeam[o.code] || 0) === 0 && j < i) return true;
      return false;
    }).length;
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

// ── Test suite 7: Early rank – tiebreaker tie must NOT resolve early ─────

console.log("\n=== Test suite 7: Early rank – potential points tie prevents early resolution ===");

/*
 * Bug scenario: Team A leads on tiebreaker, Team B can still tie on points.
 *
 *   A: 10 pts, 0 remaining  (currently rank 1 by tiebreaker)
 *   B:  8 pts, 1 remaining  (max = 10 pts → could tie A)
 *   C:  4 pts, 1 remaining  (max = 6 pts → no threat to top)
 *
 * B vs C is the remaining game.  If B wins → B has 10 pts and could overtake
 * A on tiebreakers (e.g. more wins, more goals).  Rank 1 must NOT be resolved
 * early for A.
 */
{
  const standings = [
    { code: "A", pts: 10, wins: 5, gf: 50, ga: 20, played: 5 },
    { code: "B", pts:  8, wins: 4, gf: 48, ga: 22, played: 4 },
    { code: "C", pts:  4, wins: 2, gf: 30, ga: 40, played: 4 },
  ];
  const remaining = { A: 0, B: 1, C: 1 };

  const resolved = getEarlyResolvedGroupRanks(standings, remaining);

  assert(!resolved.has(1), "Rank 1 NOT resolved: B could tie A on points and win on tiebreakers");
  assert(!resolved.has(2), "Rank 2 NOT resolved: B or C could still change position");
  assertEqual(resolved.get(3), "C", "Rank 3 secured for C: max 6 pts, can't reach A(10) or B(8+2=10)… wait, C max=6 < B min=8, and A=10");
}

// ── Test suite 8: Early rank – clear leader is safe ──────────────────────

console.log("\n=== Test suite 8: Early rank – clear points leader is safe ===");

/*
 *   A: 14 pts, 0 remaining
 *   B: 10 pts, 1 remaining  (max = 12)
 *   C:  6 pts, 1 remaining  (max = 8)
 *
 * Nobody can reach 14 → Rank 1 is safe for A.
 * B max (12) > A pts? No (12 < 14).  C max (8) < 14.
 */
{
  const standings = [
    { code: "A", pts: 14, wins: 7, gf: 70, ga: 30, played: 7 },
    { code: "B", pts: 10, wins: 5, gf: 50, ga: 40, played: 6 },
    { code: "C", pts:  6, wins: 3, gf: 30, ga: 50, played: 6 },
  ];
  const remaining = { A: 0, B: 1, C: 1 };

  const resolved = getEarlyResolvedGroupRanks(standings, remaining);

  assertEqual(resolved.get(1), "A", "Rank 1 secured for A: nobody can reach 14 pts");
  assertEqual(resolved.get(2), "B", "Rank 2 secured for B: C max=8 cannot reach B(10), A definitely above");
}

// ── Test suite 9: Early rank – both finalized at same points ─────────────

console.log("\n=== Test suite 9: Early rank – finalized teams with equal points ===");

/*
 *   A: 10 pts, 0 remaining, 5 wins  (rank 1 by tiebreaker)
 *   B: 10 pts, 0 remaining, 4 wins  (rank 2 by tiebreaker)
 *   C:  4 pts, 2 remaining          (max = 8, has open games)
 *
 * A and B are both done.  Their tiebreaker order is final (A > B).
 * C's max is 8 < 10, so C can't reach either.
 * Both rank 1 and 2 should be resolved.
 */
{
  const standings = [
    { code: "A", pts: 10, wins: 5, gf: 55, ga: 30, played: 5 },
    { code: "B", pts: 10, wins: 4, gf: 50, ga: 35, played: 5 },
    { code: "C", pts:  4, wins: 2, gf: 20, ga: 40, played: 3 },
  ];
  const remaining = { A: 0, B: 0, C: 2 };

  const resolved = getEarlyResolvedGroupRanks(standings, remaining);

  assertEqual(resolved.get(1), "A", "Rank 1 secured for A: B is finalized below, C can't reach 10");
  assertEqual(resolved.get(2), "B", "Rank 2 secured for B: A is finalized above, C can't reach 10");
  assertEqual(resolved.get(3), "C", "Rank 3 secured for C: only one left");
}

// ── Test suite 10: Early rank – team with remaining games could lose rank ─

console.log("\n=== Test suite 10: Early rank – team with own remaining games not safe on tie ===");

/*
 *   A: 10 pts, 1 remaining, 5 wins  (rank 1 by tiebreaker)
 *   B: 10 pts, 0 remaining, 4 wins  (rank 2 by tiebreaker)
 *
 * A has 1 remaining game.  If A loses, A stays at 10 but tiebreaker stats
 * change (fewer wins relative).  This doesn't change points, but the comment
 * "oRemaining > 0 || myRemaining > 0" catches this: A's own remaining games
 * mean A's tiebreaker stats are not final.
 * Rank 1 should NOT be resolved because A could lose tiebreaker to B.
 */
{
  const standings = [
    { code: "A", pts: 10, wins: 5, gf: 55, ga: 30, played: 5 },
    { code: "B", pts: 10, wins: 4, gf: 50, ga: 35, played: 6 },
  ];
  const remaining = { A: 1, B: 0 };

  const resolved = getEarlyResolvedGroupRanks(standings, remaining);

  assert(!resolved.has(1), "Rank 1 NOT resolved: A still has games, tiebreakers could change");
  assert(!resolved.has(2), "Rank 2 NOT resolved: order not yet certain");
}

// ── Test suite 11: Early rank – last place clearly locked ────────────────

console.log("\n=== Test suite 11: Early rank – last place locked despite open games ===");

/*
 * 4-team group, 1 game remaining (B vs D):
 *   A: 8 pts, 0 remaining
 *   B: 6 pts, 1 remaining (max = 8)
 *   C: 4 pts, 0 remaining
 *   D: 2 pts, 1 remaining (max = 4)
 *
 * D max = 4 = C pts.  But D has 1 remaining game → tie with C possible, and
 * tiebreakers uncertain.  So rank 3 is NOT safe for C.
 * D max (4) < B min (6), < A (8).  So rank 4 is safe for D.
 * A: B max = 8 = A pts, B has remaining → rank 1 NOT safe.
 */
{
  const standings = [
    { code: "A", pts: 8, wins: 4, gf: 40, ga: 20, played: 4 },
    { code: "B", pts: 6, wins: 3, gf: 35, ga: 25, played: 3 },
    { code: "C", pts: 4, wins: 2, gf: 25, ga: 30, played: 4 },
    { code: "D", pts: 2, wins: 1, gf: 20, ga: 35, played: 3 },
  ];
  const remaining = { A: 0, B: 1, C: 0, D: 1 };

  const resolved = getEarlyResolvedGroupRanks(standings, remaining);

  assert(!resolved.has(1), "Rank 1 NOT resolved: B could tie A on points (8) with remaining game");
  assert(!resolved.has(2), "Rank 2 NOT resolved: B/C positions uncertain");
  assert(!resolved.has(3), "Rank 3 NOT resolved: D could tie C on points (4) with remaining game");
  assert(!resolved.has(4), "Rank 4 NOT resolved: D could tie C at 4 pts with remaining game and overtake on tiebreakers");
}

// ── Test suite 12: Early rank – old bug reproduction ─────────────────────

console.log("\n=== Test suite 12: Reproducing the original bug (strict > vs >=) ===");

/*
 * With the OLD (buggy) logic using strict >, a team that can tie on points
 * would NOT be counted in couldExceed, wrongly securing ranks.
 *
 * This test verifies the fix: if oMax === team.pts and someone has remaining
 * games, rank must NOT be resolved.
 *
 *   A: 12 pts, 0 remaining (rank 1)
 *   B: 10 pts, 1 remaining (max 12, could tie A)
 *   C:  8 pts, 0 remaining
 *   D:  6 pts, 1 remaining (max 8, could tie C)
 *   E:  2 pts, 0 remaining
 *
 * Old bug: rank 1 would be resolved for A (B's max 12 > 12 is false).
 * Fix: rank 1 NOT resolved (B could tie A at 12 and win on tiebreakers).
 */
{
  const standings = [
    { code: "A", pts: 12, wins: 6, gf: 60, ga: 25, played: 6 },
    { code: "B", pts: 10, wins: 5, gf: 58, ga: 28, played: 5 },
    { code: "C", pts:  8, wins: 4, gf: 40, ga: 35, played: 6 },
    { code: "D", pts:  6, wins: 3, gf: 35, ga: 40, played: 5 },
    { code: "E", pts:  2, wins: 1, gf: 20, ga: 55, played: 6 },
  ];
  const remaining = { A: 0, B: 1, C: 0, D: 1, E: 0 };

  const resolved = getEarlyResolvedGroupRanks(standings, remaining);

  assert(!resolved.has(1), "BUG FIX: Rank 1 NOT resolved — B could tie A at 12 pts");
  assert(!resolved.has(2), "Rank 2 NOT resolved — B still has games, order unclear");
  assert(!resolved.has(3), "Rank 3 NOT resolved — D could tie C at 8 pts");
  assert(!resolved.has(4), "Rank 4 NOT resolved — D still has a game");
  assertEqual(resolved.get(5), "E", "Rank 5 secured for E: E max=2, everyone else ≥ 6");
}

// ── Test suite 13: Plausch double-RR – leader must not resolve when
//    challenger can tie on points (exact screenshot scenario) ──────────────

console.log("\n=== Test suite 13: Plausch double-RR – leader can be caught on points ===");

/*
 * Reproduces the exact state from the reported screenshot:
 *   4 teams, double round-robin (12 games), 9 played / 3 remaining.
 *
 * Current standings:
 *   P3 (🤷‍♂️):        5 played, 5 wins, 10 pts, gf=93, ga=68
 *   P2 (Kei Ahnig):    4 played, 3 wins,  6 pts, gf=57, ga=45
 *   P1 (Basler Läckerli): 5 played, 0 wins, 1 pt,  gf=67, ga=92  (1 draw)
 *   P4 (Klek):          4 played, 0 wins, 1 pt,  gf=64, ga=76  (1 draw)
 *
 * Remaining games:
 *   p-g10: P4 vs P2  (Klek vs Kei Ahnig)
 *   p-g11: P3 vs P2  (🤷‍♂️ vs Kei Ahnig)
 *   p-g12: P1 vs P4  (Basler Läckerli vs Klek)
 *
 * Max points: P3=12, P2=10, P1=3, P4=5
 *
 * Key scenario: P2 wins both remaining games → P2 reaches 10 pts = P3 pts.
 * P3 loses to P2 (the direct encounter) → P3 stays at 10 pts.
 * Both at 10 pts, P3 with 5 wins, P2 with 5 wins → tiebreaker by gf/ratio.
 * Since tiebreakers are not finalized, NO rank should be resolved early
 * (except possibly rank 3/4 under certain conditions).
 *
 * BUG (old code): Rank 1 was resolved for P3 because the strict >
 * comparison didn't count P2 as a threat (10 > 10 is false).
 */
{
  const standings = [
    { code: "P3", pts: 10, wins: 5, gf: 93, ga: 68, played: 5 },
    { code: "P2", pts:  6, wins: 3, gf: 57, ga: 45, played: 4 },
    { code: "P1", pts:  1, wins: 0, gf: 67, ga: 92, played: 5 },
    { code: "P4", pts:  1, wins: 0, gf: 64, ga: 76, played: 4 },
  ];
  const remaining = { P3: 1, P2: 2, P1: 1, P4: 2 };

  const resolved = getEarlyResolvedGroupRanks(standings, remaining);

  assert(!resolved.has(1), "Rank 1 NOT resolved: P2 can tie P3 at 10 pts (wins both remaining)");
  assert(!resolved.has(2), "Rank 2 NOT resolved: P2 still has 2 games, final position uncertain");
  assert(!resolved.has(3), "Rank 3 NOT resolved: P1/P4 positions depend on remaining results");
  assert(!resolved.has(4), "Rank 4 NOT resolved: P4 can tie P1 at 3 pts via remaining games");
}

// ── Test suite 14: Plausch – all group games done, ranks resolve normally ─

console.log("\n=== Test suite 14: Plausch – all games done, all ranks resolved ===");

/*
 * Same scenario but all 12 games are played. All remaining games resolved:
 *   P2 wins both → P2 = 10 pts, 5 wins
 *   P3 loses to P2 → P3 stays at 10 pts, 5 wins
 *   P4 beats P1 → P4 = 3 pts, P1 stays at 1 pt
 *
 * With equal pts/wins, tiebreaker goes to gf. If P3 still has higher gf,
 * P3 stays rank 1 – but the point is: with 0 remaining, all ranks resolve.
 */
{
  const standings = [
    { code: "P3", pts: 10, wins: 5, gf: 103, ga: 83, played: 6 },
    { code: "P2", pts: 10, wins: 5, gf: 82,  ga: 60, played: 6 },
    { code: "P4", pts:  3, wins: 1, gf: 79,  ga: 86, played: 6 },
    { code: "P1", pts:  1, wins: 0, gf: 72,  ga: 107, played: 6 },
  ];
  const remaining = { P3: 0, P2: 0, P1: 0, P4: 0 };

  const resolved = getEarlyResolvedGroupRanks(standings, remaining);

  assertEqual(resolved.get(1), "P3", "Rank 1 resolved for P3: all done, P3 leads on gf tiebreaker");
  assertEqual(resolved.get(2), "P2", "Rank 2 resolved for P2: all done, finalized tiebreaker");
  assertEqual(resolved.get(3), "P4", "Rank 3 resolved for P4: all done");
  assertEqual(resolved.get(4), "P1", "Rank 4 resolved for P1: all done");
}

// ── Test suite 15: Leader safe when point gap is strict ───────────────────

console.log("\n=== Test suite 15: Leader safe – nobody can reach leader's points ===");

/*
 * Variation of the Plausch scenario where the leader has a strict point gap:
 *   P3: 12 pts, 0 remaining
 *   P2:  6 pts, 2 remaining (max = 10 < 12)
 *   P1:  2 pts, 0 remaining
 *   P4:  0 pts, 2 remaining (max = 4)
 *
 * Nobody can reach 12 → Rank 1 safe.
 * P2 max (10) > P1 pts (2) → P2 could overtake P1. But P2 max (10) < 12.
 */
{
  const standings = [
    { code: "P3", pts: 12, wins: 6, gf: 100, ga: 60, played: 6 },
    { code: "P2", pts:  6, wins: 3, gf:  50, ga: 50, played: 4 },
    { code: "P1", pts:  2, wins: 1, gf:  40, ga: 80, played: 6 },
    { code: "P4", pts:  0, wins: 0, gf:  30, ga: 90, played: 4 },
  ];
  const remaining = { P3: 0, P2: 2, P1: 0, P4: 2 };

  const resolved = getEarlyResolvedGroupRanks(standings, remaining);

  assertEqual(resolved.get(1), "P3", "Rank 1 secured for P3: max opponent pts (10) < 12");
  assertEqual(resolved.get(2), "P2", "Rank 2 secured for P2: P1 max=2 and P4 max=4, neither can reach P2's 6 pts");
  assert(!resolved.has(3), "Rank 3 NOT resolved: P4 max=4 > P1 pts=2, could overtake");
  assert(!resolved.has(4), "Rank 4 NOT resolved: P4 could rise to rank 3");
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
