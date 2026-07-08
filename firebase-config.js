import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCSbJFWsDeQhYUn3SwJMFTiI4lk-97uTwg",
  authDomain: "queeridas.firebaseapp.com",
  projectId: "queeridas",
  storageBucket: "queeridas.firebasestorage.app",
  messagingSenderId: "417403077783",
  appId: "1:417403077783:web:91869003ef6cfbd3c6d5d2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Proteção de Rota
if (!window.location.pathname.includes("login.html")) {
    onAuthStateChanged(auth, (user) => {
        if (!user) window.location.href = "login.html";
    });
}

export { auth, db, doc, getDoc, setDoc, onSnapshot, signInWithEmailAndPassword, signOut };