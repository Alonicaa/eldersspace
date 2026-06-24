import 'package:flutter/foundation.dart';

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

    if (kIsWeb) {
      // Web: Use localhost
      return 'http://localhost:3000';
    }

    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        // Android emulator maps host localhost to 10.0.2.2
        // For Google Cloud SQL backend, use the actual IP/domain
        return 'http://10.0.2.2:3000';
      case TargetPlatform.iOS:
        // iOS simulator can use localhost or use your deployed backend
        return 'http://localhost:3000';
      default:
        return 'http://localhost:3000';
    }
  }

  static String get apiBaseUrl => '$serverBaseUrl/api';

  // Google Cloud Text-to-Speech API Key
  static const String googleTtsApiKey = 'AIzaSyDye4W51NfrN6l4nX8tJKKrWWqjPblGdmA';
}
