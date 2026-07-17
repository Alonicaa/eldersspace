// Firebase Cloud Messaging service worker for web push.
// Required for FCM to deliver notifications on web at all (foreground and
// background) — without this file registered at the site root, the browser
// has nothing to receive the push event with.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDM6nJwsppyJkXD5AaOwYrldDvP6RMPJWA',
  authDomain: 'eldersspace.firebaseapp.com',
  projectId: 'eldersspace',
  messagingSenderId: '330333979241',
  appId: '1:330333979241:web:183782103f0740ad4f98f8',
  storageBucket: 'eldersspace.firebasestorage.app',
});

const messaging = firebase.messaging();

// Background messages (tab not focused / closed) show via the browser's
// native notification API. Foreground messages are handled in Dart via
// FirebaseMessaging.onMessage instead.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'EldersSpace';
  const options = {
    body: payload.notification?.body || '',
    icon: '/icons/Icon-192.png',
  };
  self.registration.showNotification(title, options);
});
