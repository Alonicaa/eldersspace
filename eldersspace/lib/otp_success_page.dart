import 'package:flutter/material.dart';
import 'set_name_page.dart';
import 'home_page.dart';

class OtpSuccessPage extends StatefulWidget {
  final String phoneNumber;
  final bool needsName;

  const OtpSuccessPage({
    super.key,
    required this.phoneNumber,
    required this.needsName,
  });

  @override
  State<OtpSuccessPage> createState() => _OtpSuccessPageState();
}

class _OtpSuccessPageState extends State<OtpSuccessPage>
    with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  late Animation<double> _scaleAnim;
  late Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    _scaleAnim = CurvedAnimation(
      parent: _animController,
      curve: Curves.elasticOut,
    );

    _fadeAnim = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _animController,
        curve: const Interval(0.3, 1.0, curve: Curves.easeIn),
      ),
    );

    _animController.forward();
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  void proceed() {
    if (widget.needsName) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => SetNamePage(phoneNumber: widget.phoneNumber),
        ),
      );
    } else {
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (_) => HomePage(phoneNumber: widget.phoneNumber)),
        (route) => false,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    return MediaQuery(
      data: media.copyWith(textScaler: TextScaler.linear(1.0)),
      child: Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Back button
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              child: TextButton.icon(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.chevron_left,
                    color: Color(0xFF444444), size: 22),
                label: const Text(
                  'ย้อนกลับ',
                  style: TextStyle(color: Color(0xFF444444), fontSize: 15),
                ),
                style: TextButton.styleFrom(
                  alignment: Alignment.centerLeft,
                ),
              ),
            ),

            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) => SingleChildScrollView(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: constraints.maxHeight),
                    child: IntrinsicHeight(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          // Animated checkmark circle
                          ScaleTransition(
                            scale: _scaleAnim,
                            child: Container(
                              width: 110,
                              height: 110,
                              decoration: const BoxDecoration(
                                shape: BoxShape.circle,
                                color: Color(0xFF3B6FD4),
                                boxShadow: [
                                  BoxShadow(
                                    color: Color(0x333B6FD4),
                                    blurRadius: 24,
                                    offset: Offset(0, 8),
                                  ),
                                ],
                              ),
                              child: const Icon(
                                Icons.check,
                                color: Colors.white,
                                size: 60,
                              ),
                            ),
                          ),

                          const SizedBox(height: 36),

                          FadeTransition(
                            opacity: _fadeAnim,
                            child: Column(
                              children: [
                                const Text(
                                  'ยืนยันรหัสสำเร็จ',
                                  style: TextStyle(
                                    fontSize: 24,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF1A3A6B),
                                  ),
                                ),

                                const SizedBox(height: 12),

                                const Padding(
                                  padding: EdgeInsets.symmetric(horizontal: 40),
                                  child: Text(
                                    'ตั้งค่าข้อมูลของคุณเพื่อเริ่มต้นใช้งาน',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontSize: 15,
                                      color: Color(0xFF888888),
                                      height: 1.5,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 60),

                          // Button
                          FadeTransition(
                            opacity: _fadeAnim,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 28),
                              child: SizedBox(
                                width: double.infinity,
                                height: 52,
                                child: ElevatedButton(
                                  onPressed: proceed,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFF3B6FD4),
                                    foregroundColor: Colors.white,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    elevation: 0,
                                  ),
                                  child: const Text(
                                    'ดำเนินการต่อ',
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
      ),
    );
  }
}