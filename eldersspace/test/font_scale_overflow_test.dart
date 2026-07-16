import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// Reproduces the exact layout of `_buildPartnerCard` in all_partners_page.dart
// (Stack with 80px cover + Padding(10) + name Text maxLines:2 + description
// Text maxLines:2) inside a GridView cell with a fixed mainAxisExtent: 220,
// to check whether it overflows at the new 1.6x "ใหญ่มาก" font scale option.
Widget _partnerCard({required String name, required String description}) {
  return Container(
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 80, width: double.infinity),
        Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(width: 36, height: 36, color: Colors.grey.shade200),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      name,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              if (description.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600, height: 1.35),
                ),
              ],
            ],
          ),
        ),
      ],
    ),
  );
}

Widget _grid(double scale) {
  return MaterialApp(
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
      child: child!,
    ),
    home: Scaffold(
      body: GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          mainAxisExtent: 220,
        ),
        itemCount: 4,
        itemBuilder: (ctx, i) => _partnerCard(
          name: 'ร้านค้าพันธมิตรชื่อยาวมากทดสอบการตัดคำสองบรรทัด',
          description: 'คำอธิบายร้านค้าที่ยาวพอสมควรสำหรับทดสอบสองบรรทัดเต็มความกว้างการ์ด',
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('partner card at 1.3x (current elder mode) does not overflow', (tester) async {
    await tester.pumpWidget(_grid(1.3));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('partner card at 1.6x (new xlarge option) does not overflow', (tester) async {
    await tester.pumpWidget(_grid(1.6));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
