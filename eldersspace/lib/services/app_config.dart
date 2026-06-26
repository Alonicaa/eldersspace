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

    return 'https://eldersspace-backend.onrender.com';
  }

  static String get apiBaseUrl => '$serverBaseUrl/api';

  // Google Cloud Text-to-Speech API Key
  static const String googleTtsApiKey = 'AIzaSyDye4W51NfrN6l4nX8tJKKrWWqjPblGdmA';
}
