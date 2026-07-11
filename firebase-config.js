import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, collectionGroup, doc, getDoc, onSnapshot, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// O formulário usa autenticação anônima; as demais telas exigem uma conta administrativa.
const paginaAtual = window.location.pathname.split("/").pop();
const paginaPublica = paginaAtual === "form.html" || paginaAtual === "login.html";
if (!paginaPublica) {
    onAuthStateChanged(auth, (user) => {
        if (!user || user.isAnonymous) window.location.href = "login.html";
    });
}

export {
  auth,
  db,
  collection,
  collectionGroup,
  doc,
  getDoc,
  onAuthStateChanged,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateDoc,
  where
};
