import 'dart:ui' show PointerDeviceKind;
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'login_page.dart';
import 'home_page.dart';
import 'services/app_settings_service.dart';
import 'services/deep_link_service.dart';

final FlutterLocalNotificationsPlugin _localNotifications =
    FlutterLocalNotificationsPlugin();

const AndroidNotificationChannel _pushChannel = AndroidNotificationChannel(
  'eldersspace_push_notifications',
  'EldersSpace Notifications',
  description: 'Push notifications from the EldersSpace app',
  importance: Importance.high,
);

// Handles FCM messages that arrive while the app is terminated
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

Future<void> _showForegroundNotification(RemoteMessage message) async {
  final notification = message.notification;
  if (notification == null) return;

  await _localNotifications.show(
    notification.hashCode,
    notification.title,
    notification.body,
    NotificationDetails(
      android: AndroidNotificationDetails(
        _pushChannel.id,
        _pushChannel.name,
        channelDescription: _pushChannel.description,
        importance: Importance.high,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
      ),
    ),
  );
}

Future<void> _initFirebase() async {
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    await _localNotifications.initialize(
      const InitializationSettings(android: androidInit),
    );
    await _localNotifications
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(_pushChannel);

    await FirebaseMessaging.instance
        .setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );

    await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    await _localNotifications
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.requestNotificationsPermission();

    FirebaseMessaging.onMessage.listen(_showForegroundNotification);
  } catch (_) {
    // Firebase not configured yet — add google-services.json / GoogleService-Info.plist
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (kIsWeb) {
    usePathUrlStrategy();
    final postId = DeepLinkService.extractPostId(Uri.base);
    if (postId != null) DeepLinkService.setPendingPostId(postId);
  }

  await AppSettingsService.instance.load();

  if (!kIsWeb) {
    await DeepLinkService.init().timeout(
      const Duration(seconds: 5),
      onTimeout: () {},
    );
  }

  await _initFirebase().timeout(
    const Duration(seconds: 8),
    onTimeout: () {},
  );
  runApp(const MyApp());
}

// Flutter's default ScrollBehavior only treats touch/stylus as drag
// gestures, so on web a mouse click-drag over a ListView/PageView does
// nothing (only the scrollbar or wheel works). This adds mouse/trackpad
// support so horizontal card lists can be swiped with a mouse too.
class AppScrollBehavior extends MaterialScrollBehavior {
  @override
  Set<PointerDeviceKind> get dragDevices => {
        PointerDeviceKind.touch,
        PointerDeviceKind.mouse,
        PointerDeviceKind.trackpad,
        PointerDeviceKind.stylus,
      };
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  static const _seedColor = Color(0xFF2E7D32);

  ThemeData _buildTheme({required bool isElder}) {
    return ThemeData(
      useMaterial3: true,
      colorSchemeSeed: _seedColor,
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: Size(88, isElder ? 56 : 44),
          padding: isElder
              ? const EdgeInsets.symmetric(horizontal: 24, vertical: 16)
              : const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          textStyle: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: Size(88, isElder ? 56 : 44),
          padding: isElder
              ? const EdgeInsets.symmetric(horizontal: 24, vertical: 16)
              : const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          textStyle: const TextStyle(fontSize: 18),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: Size(64, isElder ? 48 : 36),
          padding: isElder
              ? const EdgeInsets.symmetric(horizontal: 16, vertical: 12)
              : const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          textStyle: const TextStyle(fontSize: 18),
        ),
      ),
      iconTheme: IconThemeData(size: isElder ? 28 : 24),
      inputDecorationTheme: InputDecorationTheme(
        contentPadding: isElder
            ? const EdgeInsets.symmetric(horizontal: 16, vertical: 18)
            : const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final settings = AppSettingsService.instance;
    final savedPhone = settings.savedPhone;

    return ValueListenableBuilder<bool>(
      valueListenable: settings.elderModeNotifier,
      builder: (context, isElder, _) {
        return ValueListenableBuilder<double>(
          valueListenable: settings.fontScaleNotifier,
          builder: (context, fontScale, _) {
            final effectiveScale = isElder ? (fontScale > 1.3 ? fontScale : 1.3) : fontScale;
            return MaterialApp(
              debugShowCheckedModeBanner: false,
              navigatorKey: DeepLinkService.navigatorKey,
              scrollBehavior: AppScrollBehavior(),
              theme: _buildTheme(isElder: isElder),
              builder: (context, child) {
                final media = MediaQuery.of(context);
                return MediaQuery(
                  data: media.copyWith(
                    textScaler: TextScaler.linear(effectiveScale),
                  ),
                  child: child ?? const SizedBox.shrink(),
                );
              },
              home: savedPhone != null
                  ? HomePage(phoneNumber: savedPhone)
                  : const LoginPage(),
            );
          },
        );
      },
    );
  }
}
