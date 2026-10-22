// Standardwerte für neue Gruppen (der Gruppen-Admin kann sie beim Erstellen ändern).
export const CONFIG = {
  defaults: { situps: 100, pushups: 50, penalty: 5 },

  // Firebase-Konfiguration aus der Firebase-Konsole (Projekteinstellungen > Web-App).
  firebase: {
    apiKey: "AIzaSyCm7waXvtXVxm8TuVLzWeEyYVrq6tMaBjo",
    authDomain: "er-f8786.firebaseapp.com",
    projectId: "er-f8786",
    storageBucket: "er-f8786.firebasestorage.app",
    messagingSenderId: "406213478169",
    appId: "1:406213478169:web:8e7ff233bb36eea82ca788",
  },

  // Handy-Benachrichtigungen (kostenloser Cloudflare-Worker). Solange hier nichts steht, ist die Funktion aus.
  push: {
    workerUrl: "https://sweat-or-pay-push.machatzkedevin.workers.dev",
    vapidPublicKey: "BAUg5b-jBvZMrJDBT1zlaupB-p-24sa_9p3Fo0Xp7vNsCDB_QcpGcykwnS_hlm0rA4fFUUACMG2iuDteX8LDUIE",
  },
};
