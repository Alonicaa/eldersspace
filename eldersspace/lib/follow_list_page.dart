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

  @override
  void initState() {
    super.initState();
    loadList();
  }

  void loadList() async {
    final data = widget.isFollowing
        ? await ApiService.getFollowing(widget.phoneNumber)
        : await ApiService.getFollowers(widget.phoneNumber);

    setState(() {
      users = data;
      isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isFollowing ? "กำลังติดตาม" : "ผู้ติดตาม"),
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              itemCount: users.length,
              itemBuilder: (context, index) {
                final user = users[index];

                return ListTile(
                  leading: const CircleAvatar(
                    backgroundImage: AssetImage('assets/images/profile.jpg'),
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
