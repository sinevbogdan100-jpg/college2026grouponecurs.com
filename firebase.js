import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, onSnapshot, updateDoc, deleteDoc, deleteField } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// Единая конфигурация Firebase проекта группы.
export const firebaseConfig = {
    apiKey: "AIzaSyDwFm2OB9BTKnGYmPG_siRsZoAh_cCMK2w",
    authDomain: "sbpgroup-toe-26-9-1.firebaseapp.com",
    projectId: "sbpgroup-toe-26-9-1",
    storageBucket: "sbpgroup-toe-26-9-1.firebasestorage.app",
    messagingSenderId: "984164177952",
    appId: "1:984164177952:web:c332ee08c78ce87b4b4445",
    measurementId: "G-V88BPGYH33"
};

export function createFirebaseServices() {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    return { app, auth, db };
}

export {
    signInAnonymously,
    doc,
    setDoc,
    getDoc,
    collection,
    getDocs,
    onSnapshot,
    updateDoc,
    deleteDoc,
    deleteField
};
