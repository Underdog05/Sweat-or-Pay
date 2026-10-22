// Hier kannst du Namen, Ziele und Strafe anpassen.
// "id" nur Kleinbuchstaben/Zahlen, ohne Leerzeichen, und nach dem Start nicht mehr ändern.
export const CONFIG = {
  players: [
    { id: "devin", name: "Devin" },
    { id: "henrik", name: "Henrik" },
  ],
  goals: { situps: 100, pushups: 50 },
  penalty: 5, // Euro pro verlorenem Tag

  // Firebase-Konfiguration: aus der Firebase-Konsole kopieren (Projekteinstellungen > Web-App).
  // Solange hier "HIER_EINTRAGEN" steht, läuft die App im Demo-Modus (Daten nur auf diesem Gerät).
  firebase: {
    apiKey: "AIzaSyCm7waXvtXVxm8TuVLzWeEyYVrq6tMaBjo",
    authDomain: "er-f8786.firebaseapp.com",
    projectId: "er-f8786",
    storageBucket: "er-f8786.firebasestorage.app",
    messagingSenderId: "406213478169",
    appId: "1:406213478169:web:8e7ff233bb36eea82ca788",
  },
};
