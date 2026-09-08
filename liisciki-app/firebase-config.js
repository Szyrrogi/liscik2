// ============================================================
// KONFIGURACJA FIREBASE
// ============================================================
// 1. Wejdź na https://console.firebase.google.com i utwórz nowy projekt.
// 2. W projekcie dodaj aplikację webową (ikona "</>").
// 3. Skopiuj obiekt konfiguracyjny, który dostaniesz, i wklej go poniżej
//    zamiast wartości "TU-WKLEJ-...".
// 4. Włącz w konsoli: Authentication -> Sign-in method -> Email/Password.
// 5. Włącz Firestore Database (tryb produkcyjny) i wgraj reguły
//    z pliku firestore.rules (Firestore -> Rules -> wklej i opublikuj).
// Pełna instrukcja krok po kroku jest w pliku README.md.
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDJ1WY3VOu7viHsAIxMJN4rStfD_XaBNRQ",
  authDomain: "liisciki.firebaseapp.com",
  projectId: "liisciki",
  storageBucket: "liisciki.firebasestorage.app",
  messagingSenderId: "621895814852",
  appId: "1:621895814852:web:3d0842e409d085bdf1c391",
  measurementId: "G-7GQWLKPMNG"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
