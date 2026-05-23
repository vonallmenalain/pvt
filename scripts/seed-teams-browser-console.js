/**
 * seed-teams-browser-console.js
 *
 * Paste this script into the browser console while the tournament app is open
 * and you are logged in as an admin. It will insert all 19 teams directly
 * via the same Firebase connection the app already has.
 *
 * Steps:
 *   1. Open the tournament app in your browser
 *   2. Log in as admin (Turnierorganisation)
 *   3. Open browser DevTools → Console
 *   4. Paste the entire contents of this file and press Enter
 */

(async () => {
  // Grab the Firestore instance and helpers that the app already loaded
  const { db } = await import("./firebase-config.js");
  const { addDoc, collection, serverTimestamp } = await import(
    "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"
  );
  const { getAuth } = await import(
    "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"
  );

  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    console.error("❌ Not logged in – please sign in to the app first.");
    return;
  }
  console.log(`✅ Signed in as ${user.email} (uid: ${user.uid})`);

  const TEAMS = [
    // ── Jugendliche (youth) ── J1–J9
    { name: "Zaziki Sauce",                    community: "Solothurn",                                    category: "youth",           code: "J1", manager: "Raphael Huber" },
    { name: "Serve the ball - serve the lord", community: "Aarau, Zollikofen, Interlaken, Biel, Pratteln",category: "youth",           code: "J2", manager: "Elias Moyao" },
    { name: "Niemer",                          community: "Zollikofen",                                   category: "youth",           code: "J3", manager: "Ashleen" },
    { name: "Schmäschörs",                     community: "Zollikofen",                                   category: "youth",           code: "J4", manager: "Iria Ferradans Bujan" },
    { name: "Team Fuego",                      community: "Gemischtes Team von verschiedenen Gemeinden",  category: "youth",           code: "J5", manager: "Lavinia Stähli" },
    { name: "Joey und die Anderen",            community: "Basel",                                        category: "youth",           code: "J6", manager: "Joey" },
    { name: "Wildcats",                        community: "Solothurn",                                    category: "youth",           code: "J7", manager: "Samuel Schmidtke" },
    { name: "Blockbusters",                    community: "Solothurn",                                    category: "youth",           code: "J8", manager: "Elin Schumacher" },
    { name: "67",                              community: "Burgdorf",                                     category: "youth",           code: "J9", manager: "Lia Wilson" },

    // ── Erwachsene Plausch (adult_fun) ── P1–P4
    { name: "Basler Läckerli",                 community: "Basel",                                        category: "adult_fun",       code: "P1", manager: "Simon Bader" },
    { name: "Kei Ahnig",                       community: "Burgdorf",                                     category: "adult_fun",       code: "P2", manager: "Stefan Wichtermann" },
    { name: "🤷\u200D♂\uFE0F",                community: "Burgdorf/Solothurn",                           category: "adult_fun",       code: "P3", manager: "Luca Weidmann" },
    { name: "Klek",                            community: "Richterswil",                                  category: "adult_fun",       code: "P4", manager: "Ronnie Weibel" },

    // ── Erwachsene Ambitioniert (adult_ambitious) ── A1–A6
    { name: "Mi persönlech Favorit",           community: "Zollikofen",                                   category: "adult_ambitious", code: "A1", manager: "Laurell Filbrandt" },
    { name: "Zollikofen",                      community: "Zollikofen",                                   category: "adult_ambitious", code: "A2", manager: "Matthew" },
    { name: "Ici c'est Bienne",                community: "Biel",                                         category: "adult_ambitious", code: "A3", manager: "Michel Psota" },
    { name: "7 Zwärge mit Fründe",             community: "Burgdorf",                                     category: "adult_ambitious", code: "A4", manager: "Rahel Lauener" },
    { name: "Aufschlag-Apostel",               community: "Burgdorf",                                     category: "adult_ambitious", code: "A5", manager: "Lino Laubscher" },
    { name: "error 404",                       community: "Burgdorf, Interlaken, Pratteln",               category: "adult_ambitious", code: "A6", manager: "Alain von Allmen" },
  ];

  let ok = 0;
  let fail = 0;

  for (const team of TEAMS) {
    try {
      const docRef = await addDoc(collection(db, "teams"), {
        name:      team.name,
        community: team.community,
        manager:   team.manager,
        category:  team.category,
        code:      team.code ?? null,
        createdAt: serverTimestamp(),
        ownerUid:  user.uid,
      });
      console.log(`✓ [${team.code}] ${team.name} → ${docRef.id}`);
      ok++;
    } catch (e) {
      console.error(`✗ [${team.code}] ${team.name}:`, e);
      fail++;
    }
  }

  console.log(`\nFertig: ${ok} eingetragen, ${fail} Fehler.`);
})();
