import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** Firebase Web-App-Konfiguration (Console → Projekteinstellungen) */
const firebaseConfig = {
  apiKey: "AIzaSyD9bq5TKrfMhbQyDa6FgbbZjoxp0wOTrFc",
  authDomain: "pfahlvolleyballturnier.firebaseapp.com",
  projectId: "pfahlvolleyballturnier",
  storageBucket: "pfahlvolleyballturnier.firebasestorage.app",
  messagingSenderId: "144105225661",
  appId: "1:144105225661:web:e7c7a01d06c5d0a90926d4",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, firebaseConfig };
