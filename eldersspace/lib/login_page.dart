import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'services/api_service.dart';
import 'otp_page.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final phoneController = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  bool isLoading = false;
  bool isValidLength = false;
  bool _hasTouched = false;

  @override
  void initState() {
    super.initState();

    phoneController.addListener(() {
      setState(() {
        isValidLength = phoneController.text.length == 10;
        if (phoneController.text.isNotEmpty) _hasTouched = true;
      });
    });
  }

  @override
  void dispose() {
    phoneController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void submit() async {
    if (isLoading) return;
    setState(() => _hasTouched = true);
    if (!isValidLength) return;

    FocusScope.of(context).unfocus();

    if (mounted) {
      setState(() => isLoading = true);
    }

    Map<String, dynamic> response = <String, dynamic>{};
    try {
      response = await ApiService.requestOtp(phoneController.text);
    } finally {
      if (mounted) {
        setState(() => isLoading = false);
      }
    }

    if (!mounted) return;

    final bool isDevelopmentMode = response["isDevelopment"] == true;
    final bool hasOtpInDev = isDevelopmentMode && response["otp"] != null;
    final bool isRequestSuccess = response["success"] == true || response["error"] == null;

    if (!isRequestSuccess) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(response["error"] ?? "ขอ OTP ไม่สำเร็จ")),
      );
      return;
    }

    if (hasOtpInDev) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('โหมดพัฒนา OTP คือ ${response["otp"]}'),
          duration: const Duration(seconds: 15),
        ),
      );
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => OtpPage(phoneNumber: phoneController.text),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    return MediaQuery(
      data: media.copyWith(textScaler: TextScaler.linear(1.0)),
      child: Scaffold(
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFDCEAFF), Color(0xFFF5F8FF)],
            ),
          ),
          child: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 40),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                  const SizedBox(height: 40),

                  /// LOGO
                  Center(
                    child: SizedBox(
                      height: 180,
                      child: Image.asset(
                        'logo/logo.png',
                        fit: BoxFit.contain,
                      ),
                    ),
                  ),

                  const SizedBox(height: 20),

                  const Text(
                    'Elders Space',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF1A3A6B),
                      letterSpacing: 0.5,
                    ),
                  ),

                  const SizedBox(height: 40),

                  /// PHONE FIELD (Advanced Version)
                  TextFormField(
                    controller: phoneController,
                    focusNode: _focusNode,
                    keyboardType: TextInputType.phone,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(10),
                    ],
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                    ),
                    decoration: InputDecoration(
                      labelText: 'เบอร์โทรศัพท์',
                      hintText: 'กรอกเบอร์โทรศัพท์ 10 หลัก',

                      prefixIcon: const Icon(
                        Icons.phone_rounded,
                        color: Color(0xFF3B6FD4),
                      ),

                      // ✅ Animated Check Icon
                      suffixIcon: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 200),
                        transitionBuilder: (child, animation) =>
                            ScaleTransition(scale: animation, child: child),
                        child: isValidLength
                            ? const Padding(
                                key: ValueKey('valid'),
                                padding: EdgeInsets.only(right: 12),
                                child: Icon(
                                  Icons.check_circle,
                                  color: Colors.green,
                                ),
                              )
                            : const SizedBox(
                                key: ValueKey('empty'),
                                width: 0,
                              ),
                      ),

                      filled: true,
                      fillColor: const Color(0xFFF7F9FC),

                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: BorderSide.none,
                      ),

                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: BorderSide.none,
                      ),

                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: const BorderSide(
                          color: Color(0xFF3B6FD4),
                          width: 1.5,
                        ),
                      ),

                      errorBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide:
                            const BorderSide(color: Colors.redAccent),
                      ),

                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 18,
                      ),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'กรุณากรอกเบอร์โทรศัพท์';
                      }
                      if (value.length != 10) {
                        return 'ต้องมี 10 หลัก';
                      }
                      return null;
                    },
                  ),

                  const SizedBox(height: 6),

                  if (_hasTouched && phoneController.text.isNotEmpty && !isValidLength)
                    const Padding(
                      padding: EdgeInsets.only(left: 4),
                      child: Text(
                        'กรุณาตรวจสอบหมายเลขโทรศัพท์อีกครั้ง',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.red,
                        ),
                      ),
                    ),

                  const SizedBox(height: 4),

                  const Text(
                    'เราจะส่งรหัสยืนยันไปทาง SMS',
                    style: TextStyle(
                      fontSize: 12,
                      color: Color(0xFF888888),
                    ),
                  ),

                  const SizedBox(height: 28),

                  /// BUTTON
                  SizedBox(
                    height: 52,
                    child: ElevatedButton(
                      onPressed: isLoading ? null : submit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF3B6FD4),
                        foregroundColor: Colors.white,
                        disabledBackgroundColor:
                            const Color(0xFF3B6FD4).withValues(alpha: 0.5),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
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
                              'เข้าสู่ระบบ',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                    ),
                  ),

                  const SizedBox(height: 32),

                    /// FOOTER
                    Column(
                      children: [
                        const Text(
                          'เมื่อเข้าสู่ระบบ ถือว่ายอมรับ',
                          style: TextStyle(
                            fontSize: 12,
                            color: Color(0xFF888888),
                          ),
                          textAlign: TextAlign.center,
                        ),
                        GestureDetector(
                          onTap: () {},
                          child: const Text(
                            'นโยบายความเป็นส่วนตัว และเงื่อนไขการใช้งาน',
                            style: TextStyle(
                              fontSize: 12,
                              color: Color(0xFF3B6FD4),
                              decoration: TextDecoration.underline,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
