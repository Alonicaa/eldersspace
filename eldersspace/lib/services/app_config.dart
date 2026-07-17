class AppConfig {
  static const String _backendHost = String.fromEnvironment(
    'BACKEND_HOST',
    defaultValue: 'http://localhost:3000',
  );

  static String get serverBaseUrl {
    // Use environment variable if set, otherwise use platform-specific defaults
    if (_backendHost != 'http://localhost:3000') {
      return _backendHost;
    }

    return 'https://eldersspace-backend.onrender.com';
  }

  static String get apiBaseUrl => '$serverBaseUrl/api';

  // Web push (FCM on web) needs a dedicated Web app registered in the
  // Firebase console (Project settings > General > Add app > Web) and a
  // VAPID key pair (Project settings > Cloud Messaging > Web Push
  // certificates > Generate key pair). Fill these in once available —
  // until then, getToken() on web fails silently and browser users never
  // get an fcm_token registered, so they can't receive push at all.
  static const String webFirebaseApiKey = 'AIzaSyDM6nJwsppyJkXD5AaOwYrldDvP6RMPJWA';
  static const String webFirebaseAppId = '1:330333979241:web:183782103f0740ad4f98f8';
  static const String webPushVapidKey =
      'BLO5j1kuYeCidtDhKzL3uuu_mJ3xcscEaXuT4HpvWmhfFiQP43zkktKZUrNJ1DEh4Ayp91I8uoHNh-WMGyzAA5k';
}
