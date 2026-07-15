import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:eldersspace/login_page.dart';

void main() {
  testWidgets('LoginPage shows phone field and disabled submit until 10 digits',
      (WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(home: LoginPage()));

    expect(find.text('เข้าสู่ระบบ'), findsOneWidget);
    expect(find.byType(TextFormField), findsOneWidget);
    expect(find.byIcon(Icons.check_circle), findsNothing);

    await tester.enterText(find.byType(TextFormField), '0812345678');
    await tester.pump();

    expect(find.byIcon(Icons.check_circle), findsOneWidget);
  });
}
