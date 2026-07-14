import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { browserLocalPersistence, getAuth, GoogleAuthProvider, onAuthStateChanged, setPersistence, signInAnonymously, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch(error => {
  console.warn("Não foi possível ativar a persistência local da autenticação:", error);
});

// O formulário aceita uma conta Google comum; as demais telas exigem uma conta administrativa.
const paginaAtual = window.location.pathname.split("/").pop();
const paginaPublica = paginaAtual === "form.html" || paginaAtual === "login.html";
if (!paginaPublica) {
    onAuthStateChanged(auth, (user) => {
        if (!user || user.isAnonymous) window.location.href = "login.html";
    });
}

export {
  auth,
  authPersistenceReady,
  browserLocalPersistence,
  db,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  GoogleAuthProvider,
  onAuthStateChanged,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setPersistence,
  setDoc,
  signInAnonymously,
  signInWithPopup,
  signOut,
  updateDoc,
  where
};
