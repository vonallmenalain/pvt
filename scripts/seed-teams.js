#!/usr/bin/env node
/**
 * seed-teams.js
 *
 * Inserts the 18 definitive tournament teams into Firestore.
 *
 * Authentication: uses Firebase email/password auth (REST API).
 * No service account or Firebase CLI login required.
 *
 * Required environment variables:
 *   FIREBASE_EMAIL     – email of a Firebase Auth user with write access
 *   FIREBASE_PASSWORD  – password for that user
 *
 * Usage:
 *   FIREBASE_EMAIL=admin@example.com FIREBASE_PASSWORD=secret node scripts/seed-teams.js
 */

const PROJECT_ID = "pfahlvolleyballturnier";
const API_KEY    = "AIzaSyD9bq5TKrfMhbQyDa6FgbbZjoxp0wOTrFc";

// ── Team data ──────────────────────────────────────────────────────────────
// Categories: "youth" | "adult_fun" | "adult_ambitious"
// Codes:      J1–J9   | P1–P4      | A1–A6
// Code assignment follows the order teams appear in the definitive list.

const TEAMS = [
  // ── Jugendliche (youth) ── J1–J9
  { name: "Zaziki Sauce",                   community: "Solothurn",                                    category: "youth",            code: "J1", manager: "Raphael Huber" },
  { name: "Serve the ball - serve the lord",community: "Aarau, Zollikofen, Interlaken, Biel, Pratteln",category: "youth",            code: "J2", manager: "Elias Moyao" },
  { name: "Niemer",                         community: "Zollikofen",                                   category: "youth",            code: "J3", manager: "Ashleen" },
  { name: "Schmäschörs",                    community: "Zollikofen",                                   category: "youth",            code: "J4", manager: "Iria Ferradans Bujan" },
  { name: "Team Fuego",                     community: "Gemischtes Team von verschiedenen Gemeinden",  category: "youth",            code: "J5", manager: "Lavinia Stähli" },
  { name: "Joey und die Anderen",           community: "Basel",                                        category: "youth",            code: "J6", manager: "Joey" },
  { name: "Wildcats",                       community: "Solothurn",                                    category: "youth",            code: "J7", manager: "Samuel Schmidtke" },
  { name: "Blockbusters",                   community: "Solothurn",                                    category: "youth",            code: "J8", manager: "Elin Schumacher" },
  { name: "67",                             community: "Burgdorf",                                     category: "youth",            code: "J9", manager: "Lia Wilson" },

  // ── Erwachsene Plausch (adult_fun) ── P1–P4
  { name: "Basler Läckerli",                community: "Basel",                                        category: "adult_fun",        code: "P1", manager: "Simon Bader" },
  { name: "Kei Ahnig",                      community: "Burgdorf",                                     category: "adult_fun",        code: "P2", manager: "Stefan Wichtermann" },
  { name: "🤷‍♂️",                              community: "Burgdorf/Solothurn",                           category: "adult_fun",        code: "P3", manager: "Luca Weidmann" },
  { name: "Klek",                           community: "Richterswil",                                  category: "adult_fun",        code: "P4", manager: "Ronnie Weibel" },

  // ── Erwachsene Ambitioniert (adult_ambitious) ── A1–A6
  { name: "Mi persönlech Favorit",          community: "Zollikofen",                                   category: "adult_ambitious",  code: "A1", manager: "Laurell Filbrandt" },
  { name: "Zollikofen",                     community: "Zollikofen",                                   category: "adult_ambitious",  code: "A2", manager: "Matthew" },
  { name: "Ici c'est Bienne",               community: "Biel",                                         category: "adult_ambitious",  code: "A3", manager: "Michel Psota" },
  { name: "7 Zwärge mit Fründe",            community: "Burgdorf",                                     category: "adult_ambitious",  code: "A4", manager: "Rahel Lauener" },
  { name: "Aufschlag-Apostel",              community: "Burgdorf",                                     category: "adult_ambitious",  code: "A5", manager: "Lino Laubscher" },
  { name: "error 404",                      community: "Burgdorf, Interlaken, Pratteln",               category: "adult_ambitious",  code: "A6", manager: "Alain von Allmen" },
];

// ── Helpers ────────────────────────────────────────────────────────────────

async function signIn(email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Auth failed: ${err.error?.message ?? res.status}`);
  }
  const data = await res.json();
  return data.idToken;
}

function toFirestoreDoc(team, idToken) {
  // Build a Firestore REST document with a serverTimestamp write transform.
  return {
    fields: {
      name:      { stringValue: team.name },
      community: { stringValue: team.community },
      manager:   { stringValue: team.manager },
      category:  { stringValue: team.category },
      code:      team.code ? { stringValue: team.code } : { nullValue: null },
      ownerUid:  { stringValue: "seed-script" },
      // createdAt is set via a write transform below
    },
  };
}

async function createTeam(team, idToken) {
  const collectionUrl =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/teams` +
    `?key=${API_KEY}`;

  const res = await fetch(collectionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(toFirestoreDoc(team)),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create "${team.name}": ${res.status} ${err}`);
  }

  const doc = await res.json();
  return doc.name; // e.g. "projects/.../documents/teams/AUTO_ID"
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const email    = process.env.FIREBASE_EMAIL;
  const password = process.env.FIREBASE_PASSWORD;

  if (!email || !password) {
    console.error(
      "Error: FIREBASE_EMAIL and FIREBASE_PASSWORD environment variables are required.\n" +
      "Usage: FIREBASE_EMAIL=you@example.com FIREBASE_PASSWORD=secret node scripts/seed-teams.js"
    );
    process.exit(1);
  }

  console.log(`Signing in as ${email} …`);
  const idToken = await signIn(email, password);
  console.log("Authenticated.\n");

  let ok = 0;
  let fail = 0;

  for (const team of TEAMS) {
    try {
      const docPath = await createTeam(team, idToken);
      const docId = docPath.split("/").pop();
      console.log(`✓  [${team.code ?? "----"}] ${team.name} → ${docId}`);
      ok++;
    } catch (e) {
      console.error(`✗  [${team.code ?? "----"}] ${team.name}: ${e.message}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} inserted, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
