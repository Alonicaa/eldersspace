import 'package:flutter/material.dart';
import 'services/api_service.dart';
import 'profile_page.dart';

class FollowListPage extends StatefulWidget {
  final String phoneNumber;
  final bool isFollowing;

  const FollowListPage({
    super.key,
    required this.phoneNumber,
    required this.isFollowing,
  });

  @override
  State<FollowListPage> createState() => _FollowListPageState();
}

class _FollowListPageState extends State<FollowListPage> {
  List<dynamic> users = [];
  bool isLoading = true;
  String? errorMessage;

  @override
  void initState() {
    super.initState();
    loadList();
  }

  Future<void> loadList() async {
    setState(() {
      isLoading = true;
      errorMessage = null;
    });
    try {
      final data = widget.isFollowing
          ? await ApiService.getFollowing(widget.phoneNumber)
          : await ApiService.getFollowers(widget.phoneNumber);
      setState(() {
        users = data;
      });
    } catch (e) {
      setState(() {
        errorMessage = "ไม่สามารถโหลดรายชื่อได้ กรุณาลองใหม่";
      });
    } finally {
      setState(() {
        isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isFollowing ? "กำลังติดตาม" : "ผู้ติดตาม"),
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : errorMessage != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(errorMessage!),
                      const SizedBox(height: 12),
                      ElevatedButton(
                        onPressed: loadList,
                        child: const Text("ลองใหม่"),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  itemCount: users.length,
                  itemBuilder: (context, index) {
                    final user = users[index];
                    final avatarUrl = user["profile_picture_url"] as String?;

                    return ListTile(
                      leading: CircleAvatar(
                        backgroundImage: (avatarUrl != null && avatarUrl.isNotEmpty)
                            ? NetworkImage(avatarUrl)
                            : null,
                        child: (avatarUrl == null || avatarUrl.isEmpty)
                            ? const Icon(Icons.person)
                            : null,
                      ),
                      title: Text(user["full_name"]),
                      subtitle: Text(user["phone_number"]),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => ProfilePage(
                              phoneNumber: user["phone_number"], // คนที่ถูกกด
                              currentUserPhone: widget.phoneNumber, // คนที่ login
                            ),
                          ),
                        );
                      },
                    );
                  },
                ),
    );
  }
}
