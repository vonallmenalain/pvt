#!/usr/bin/env node
/**
 * fix-j9-code.js
 *
 * One-time fix: finds the youth team without an assigned code and sets it to "J9".
 *
 * Run this when a 9th youth team exists in Firestore but was created without
 * an explicit code field, causing the schedule to display "J9" as a placeholder
 * instead of the team's real name.
 *
 * Required environment variables:
 *   FIREBASE_EMAIL     – email of a Firebase Auth user with write access
 *   FIREBASE_PASSWORD  – password for that user
 *
 * Usage:
 *   FIREBASE_EMAIL=admin@example.com FIREBASE_PASSWORD=secret node scripts/fix-j9-code.js
 */

const PROJECT_ID = "pfahlvolleyballturnier";
const API_KEY    = "AIzaSyD9bq5TKrfMhbQyDa6FgbbZjoxp0wOTrFc";

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
  return (await res.json()).idToken;
}

async function listTeams(idToken) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/teams` +
    `?key=${API_KEY}&pageSize=50`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error(`Failed to list teams: ${res.status} ${await res.text()}`);
  return (await res.json()).documents ?? [];
}

async function patchCode(docName, code, idToken) {
  // PATCH with updateMask so only the `code` field is written.
  const url =
    `https://firestore.googleapis.com/v1/${docName}` +
    `?updateMask.fieldPaths=code&key=${API_KEY}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      fields: { code: { stringValue: code } },
    }),
  });
  if (!res.ok) throw new Error(`Failed to patch ${docName}: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function main() {
  const email    = process.env.FIREBASE_EMAIL;
  const password = process.env.FIREBASE_PASSWORD;

  if (!email || !password) {
    console.error(
      "Error: FIREBASE_EMAIL and FIREBASE_PASSWORD environment variables are required.\n" +
      "Usage: FIREBASE_EMAIL=you@example.com FIREBASE_PASSWORD=secret node scripts/fix-j9-code.js"
    );
    process.exit(1);
  }

  console.log(`Signing in as ${email} …`);
  const idToken = await signIn(email, password);
  console.log("Authenticated.\n");

  const docs = await listTeams(idToken);
  console.log(`Found ${docs.length} team document(s) in Firestore.`);

  // Collect all codes already in use so we don't accidentally double-assign.
  const usedCodes = new Set(
    docs
      .map((d) => d.fields?.code?.stringValue)
      .filter(Boolean)
  );

  if (usedCodes.has("J9")) {
    console.log("J9 is already assigned — nothing to do.");
    return;
  }

  // Find youth teams without any code.
  const uncodedYouth = docs.filter((d) => {
    const category = d.fields?.category?.stringValue;
    const code     = d.fields?.code?.stringValue;
    return category === "youth" && !code;
  });

  if (uncodedYouth.length === 0) {
    console.error("No uncoded youth team found. Check the database manually.");
    process.exit(1);
  }
  if (uncodedYouth.length > 1) {
    console.warn(`Warning: ${uncodedYouth.length} uncoded youth teams found. Patching them all to J9 would be wrong.`);
    console.warn("Aborting. Please resolve ambiguity manually.");
    for (const d of uncodedYouth) {
      const name = d.fields?.name?.stringValue ?? "?";
      const id   = d.name.split("/").pop();
      console.warn(`  ${id}  "${name}"`);
    }
    process.exit(1);
  }

  const doc  = uncodedYouth[0];
  const name = doc.fields?.name?.stringValue ?? "?";
  const id   = doc.name.split("/").pop();

  console.log(`Patching document ${id} ("${name}") → code: "J9" …`);
  await patchCode(doc.name, "J9", idToken);
  console.log(`✓  Done. Team "${name}" is now assigned code J9.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
