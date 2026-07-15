import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'services/api_service.dart';
import 'services/app_settings_service.dart';
import 'otp_success_page.dart';

class OtpPage extends StatefulWidget {
  final String phoneNumber;
  const OtpPage({super.key, required this.phoneNumber});

  @override
  State<OtpPage> createState() => _OtpPageState();
}

class _OtpPageState extends State<OtpPage> {
  final List<TextEditingController> controllers = List.generate(
    6,
    (_) => TextEditingController(),
  );
  final List<FocusNode> focusNodes = List.generate(6, (_) => FocusNode());

  bool isLoading = false;
  int _resendCountdown = 60;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  @override
  void dispose() {
    _timer?.cancel();
    for (final c in controllers) {
      c.dispose();
    }
    for (final f in focusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  void _startCountdown() {
    _resendCountdown = 60;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_resendCountdown == 0) {
        t.cancel();
      } else {
        setState(() => _resendCountdown--);
      }
    });
  }

  String get otp => controllers.map((c) => c.text).join();

  // Masked phone: show last 3 digits
  String get maskedPhone {
    final phone = widget.phoneNumber;
    if (phone.length >= 3) {
      return '*' * (phone.length - 3) + phone.substring(phone.length - 3);
    }
    return phone;
  }

  void resendOtp() async {
    if (_resendCountdown > 0) return;
    final response = await ApiService.requestOtp(widget.phoneNumber);
    if (!mounted) return;
    _startCountdown();

    final bool isDev = response["isDevelopment"] == true && response["otp"] != null;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(isDev ? 'ส่ง OTP ใหม่แล้ว — รหัสคือ ${response["otp"]}' : 'ส่ง OTP ใหม่แล้ว'),
        duration: Duration(seconds: isDev ? 10 : 3),
      ),
    );
  }

  void verify() async {
    if (!RegExp(r'^\d{6}$').hasMatch(otp)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('กรุณากรอก OTP ให้ครบ 6 หลัก')),
      );
      return;
    }

    setState(() => isLoading = true);
    final response = await ApiService.verifyOtp(widget.phoneNumber, otp);
    if (!mounted) return;
    setState(() => isLoading = false);

    if (response["error"] != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('รหัส OTP ไม่ถูกต้อง กรุณาลองอีกครั้ง'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    await AppSettingsService.instance.setActiveUser(widget.phoneNumber);
    await AppSettingsService.instance.setSavedPhone(widget.phoneNumber);
    if (!mounted) return;

    ScaffoldMessenger.of(context).clearSnackBars();

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => OtpSuccessPage(
          phoneNumber: widget.phoneNumber,
          needsName: response["needs_name"] == true,
        ),
      ),
    );
  }

  Widget _otpBox(int i) {
    return SizedBox(
      width: 46,
      height: 54,
      child: TextField(
        controller: controllers[i],
        focusNode: focusNodes[i],
        textAlign: TextAlign.center,
        maxLength: 1,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        style: const TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.bold,
          color: Color(0xFF1A3A6B),
        ),
        decoration: InputDecoration(
          counterText: '',
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFFDDDDDD)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFFDDDDDD)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFF3B6FD4), width: 2),
          ),
          contentPadding: EdgeInsets.zero,
        ),
        onChanged: (v) {
          if (v.isNotEmpty && i < 5) {
            focusNodes[i + 1].requestFocus();
          } else if (v.isEmpty && i > 0) {
            focusNodes[i - 1].requestFocus();
          }
        },
      ),
    );
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
                icon: const Icon(
                  Icons.chevron_left,
                  color: Color(0xFF444444),
                  size: 22,
                ),
                label: const Text(
                  'ย้อนกลับ',
                  style: TextStyle(color: Color(0xFF444444), fontSize: 15),
                ),
                style: TextButton.styleFrom(alignment: Alignment.centerLeft),
              ),
            ),

              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                    const SizedBox(height: 24),

                    // Phone illustration
                    Container(
                      width: 120,
                      height: 120,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: const Color(0xFFF0F5FF),
                        border: Border.all(
                          color: const Color(0xFFDCEAFF),
                          width: 8,
                        ),
                      ),
                      child: Center(
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            const Icon(
                              Icons.phone_android,
                              size: 56,
                              color: Color(0xFF3B6FD4),
                            ),
                            Positioned(
                              right: 16,
                              bottom: 16,
                              child: Container(
                                width: 28,
                                height: 28,
                                decoration: const BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: Color(0xFF4CAF50),
                                ),
                                child: const Icon(
                                  Icons.check,
                                  color: Colors.white,
                                  size: 18,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 28),

                    const Text(
                      'กรอกรหัสยืนยัน',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF1A3A6B),
                      ),
                    ),

                    const SizedBox(height: 10),

                    RichText(
                      textAlign: TextAlign.center,
                      text: TextSpan(
                        style: const TextStyle(
                          fontSize: 14,
                          color: Color(0xFF888888),
                        ),
                        children: [
                          const TextSpan(
                            text: 'กรอกรหัส OTP\nที่ส่งไปยังหมายเลข ',
                          ),
                          TextSpan(
                            text: maskedPhone,
                            style: const TextStyle(
                              color: Color(0xFF1A3A6B),
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 32),

                    // OTP Boxes
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(
                        6,
                        (i) => Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          child: _otpBox(i),
                        ),
                      ),
                    ),

                    const SizedBox(height: 20),

                    // Resend OTP
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          'ยังไม่ได้รับรหัส? ',
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.grey.shade600,
                          ),
                        ),
                        GestureDetector(
                          onTap: _resendCountdown == 0 ? resendOtp : null,
                          child: Text(
                            _resendCountdown > 0
                                ? 'ส่งรหัส OTP อีกครั้ง ($_resendCountdown)'
                                : 'ส่งรหัส OTP อีกครั้ง',
                            style: TextStyle(
                              fontSize: 13,
                              color: _resendCountdown == 0
                                  ? const Color(0xFF3B6FD4)
                                  : Colors.grey.shade400,
                              fontWeight: FontWeight.bold,
                              decoration: _resendCountdown == 0
                                  ? TextDecoration.underline
                                  : null,
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 36),

                    // Confirm button
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton(
                        onPressed: isLoading ? null : verify,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF3B6FD4),
                          foregroundColor: Colors.white,
                          disabledBackgroundColor: const Color(
                            0xFF3B6FD4,
                          ).withValues(alpha: 0.6),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          elevation: 0,
                        ),
                        child: isLoading
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2.5,
                                ),
                              )
                            : const Text(
                                'ยืนยันรหัส',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                      ),
                    ),
                    ],
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

