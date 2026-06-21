import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'services/api_service.dart';
import 'set_profile_page.dart';

class SetNamePage extends StatefulWidget {
  final String phoneNumber;
  const SetNamePage({super.key, required this.phoneNumber});

  @override
  State<SetNamePage> createState() => _SetNamePageState();
}

class _SetNamePageState extends State<SetNamePage> {
  final nameController = TextEditingController();
  bool isLoading = false;

  void submit() async {
    final name = nameController.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('กรุณากรอกชื่อบัญชี')),
      );
      return;
    }

    if (name.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('ชื่อบัญชีต้องมีอย่างน้อย 2 ตัวอักษร')),
      );
      return;
    }

    if (name.length > 30) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('ชื่อบัญชีต้องไม่เกิน 30 ตัวอักษร')),
      );
      return;
    }

    setState(() => isLoading = true);
    await ApiService.setName(widget.phoneNumber, name);
    setState(() => isLoading = false);

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => SetProfilePage(
          phoneNumber: widget.phoneNumber,
          displayName: name,
        ),
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
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(28, 16, 28, 28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'ตั้งชื่อบัญชี',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF1A3A6B),
                      ),
                    ),

                    const SizedBox(height: 10),

                    const Text(
                      'ตั้งชื่อบัญชีเพื่อให้ผู้อื่น ๆ ทราบว่าเป็นคุณ\nและสามารถค้นหาชื่อของคุณได้\nคุณสามารถเปลี่ยนชื่อผู้ใช้ได้ทุกเมื่อ',
                      style: TextStyle(
                        fontSize: 14,
                        color: Color(0xFF888888),
                        height: 1.6,
                      ),
                    ),

                    const SizedBox(height: 32),

                    // Name input
                    TextField(
                      controller: nameController,
                      autofocus: true,
                      inputFormatters: [
                        LengthLimitingTextInputFormatter(30),
                        FilteringTextInputFormatter.allow(
                          RegExp(r"[A-Za-z0-9ก-๙\s._-]"),
                        ),
                      ],
                      style: const TextStyle(
                        fontSize: 16,
                        color: Color(0xFF1A3A6B),
                      ),
                      decoration: InputDecoration(
                        hintText: 'ชื่อบัญชี',
                        hintStyle: const TextStyle(
                            color: Color(0xFFBBBBBB), fontSize: 14),
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: Color(0xFFDDDDDD)),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: Color(0xFFDDDDDD)),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(
                              color: Color(0xFF3B6FD4), width: 1.5),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 14),
                      ),
                    ),

                    const SizedBox(height: 24),

                    // Next button
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton(
                        onPressed: isLoading ? null : submit,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF3B6FD4),
                          foregroundColor: Colors.white,
                          disabledBackgroundColor:
                              const Color(0xFF3B6FD4).withValues(alpha: 0.6),
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
                                'ถัดไป',
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
