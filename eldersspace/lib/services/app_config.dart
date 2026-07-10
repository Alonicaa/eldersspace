import 'dart:io' show Platform;
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
  // Restricted per-platform on Google Cloud Console: web key by HTTP
  // referrer, Android/iOS keys by package name / bundle ID.
  static const String _ttsKeyWeb = 'AIzaSyDye4W51NfrN6l4nX8tJKKrWWqjPblGdmA';
  static const String _ttsKeyAndroid = 'AIzaSyA7CgfxglL9LJMInOIJWE5mzZkxQ3ZAD34';
  static const String _ttsKeyIos = 'AIzaSyBy3-ypU8RC-qy_Mfi2UIUjqh4TxRLBzD0';

  static String get googleTtsApiKey {
    if (kIsWeb) return _ttsKeyWeb;
    if (Platform.isAndroid) return _ttsKeyAndroid;
    if (Platform.isIOS) return _ttsKeyIos;
    return _ttsKeyWeb;
  }
}
