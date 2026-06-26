import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'app_config.dart';

class ApiService {
  static String get baseUrl => AppConfig.apiBaseUrl;

  // ── OTP ──
  static Future<Map<String, dynamic>> requestOtp(String phoneNumber) async {
    try {
      final response = await http.post(
        Uri.parse("$baseUrl/auth/request-otp"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({"phone_number": phoneNumber}),
      ).timeout(const Duration(seconds: 15));

      final dynamic decoded = response.body.isNotEmpty
          ? jsonDecode(response.body)
          : <String, dynamic>{};
      final body = decoded is Map<String, dynamic>
          ? decoded
          : <String, dynamic>{};

      if (response.statusCode != 200) {
        return {
          "error": body["error"] ?? "Failed to request OTP: ${response.statusCode}",
          ...body,
        };
      }

      return {
        "success": true,
        ...body,
      };
    } on TimeoutException {
      return {"error": "Request timeout. Please try again."};
    } catch (e) {
      return {"error": "Connection error: $e"};
    }
  }

  static Future<Map<String, dynamic>> verifyOtp(
      String phoneNumber, String otp) async {
    try {
      final response = await http.post(
        Uri.parse("$baseUrl/auth/verify-otp"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({"phone_number": phoneNumber, "otp_code": otp}),
      ).timeout(const Duration(seconds: 15));

      final dynamic decoded = response.body.isNotEmpty
          ? jsonDecode(response.body)
          : <String, dynamic>{};
      final body = decoded is Map<String, dynamic>
          ? decoded
          : <String, dynamic>{};

      if (response.statusCode != 200) {
        return {
          "error": body["error"] ?? "OTP verification failed: ${response.statusCode}",
          ...body,
        };
      }

      return {
        "success": true,
        ...body,
      };
    } on TimeoutException {
      return {"error": "Request timeout. Please try again."};
    } catch (e) {
      return {"error": "Connection error: $e"};
    }
  }

  // ── Name ──
  static Future<Map<String, dynamic>> setName(
      String phoneNumber, String fullName) async {
    final response = await http.post(
      Uri.parse("$baseUrl/auth/set-name"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"phone_number": phoneNumber, "full_name": fullName}),
    );
    return jsonDecode(response.body);
  }

  static Future<void> updateName(String phoneNumber, String fullName) async {
    final response = await http.put(
      Uri.parse("$baseUrl/users/$phoneNumber/name"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"full_name": fullName}),
    );
    if (response.statusCode != 200) {
      throw Exception("Failed to update name");
    }
  }

  // ── About Me ──
  static Future<void> updateAboutMe(String phoneNumber, String aboutMe) async {
    final response = await http.put(
      Uri.parse("$baseUrl/users/$phoneNumber/about-me"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"about_me": aboutMe}),
    );
    if (response.statusCode != 200) {
      throw Exception("Failed to update about me");
    }
  }

  static Future<String?> getAboutMe(String phoneNumber) async {
    try {
      final response = await http.get(
        Uri.parse("$baseUrl/users/$phoneNumber/about-me"),
      );
      if (response.statusCode == 200) {
        final d = jsonDecode(response.body);
        return d["about_me"] as String?;
      }
    } catch (_) {}
    return null;
  }

  // ── Profile ──
  static Future<Map<String, dynamic>> getUserProfile(
      String phoneNumber) async {
    final response =
        await http.get(Uri.parse("$baseUrl/auth/profile/$phoneNumber"));
    return jsonDecode(response.body);
  }

  static Future<String?> getUserName(String phoneNumber) async {
    final response =
        await http.get(Uri.parse("$baseUrl/auth/user/$phoneNumber"));
    final data = jsonDecode(response.body);
    return data["full_name"];
  }

  // ── Profile Picture ──

  /// Upload a profile picture, returns the public URL string
  static Future<String?> uploadProfilePicture(
      String phoneNumber, String filePath) async {
    final req = http.MultipartRequest(
      'POST',
      Uri.parse('$baseUrl/users/$phoneNumber/profile-picture'),
    );
    req.files.add(await http.MultipartFile.fromPath('avatar', filePath));
    final streamed = await req.send();
    final res = await http.Response.fromStream(streamed);
    if (res.statusCode == 200) {
      final d = jsonDecode(res.body);
      return d['profile_picture_url'] as String?;
    }
    throw Exception('Failed to upload profile picture: ${res.statusCode}');
  }

  /// Get the current profile picture URL (null if not set)
  static Future<String?> getProfilePictureUrl(String phoneNumber) async {
    try {
      final res = await http.get(
        Uri.parse('$baseUrl/users/$phoneNumber/profile-picture'),
      );
      if (res.statusCode == 200) {
        final d = jsonDecode(res.body);
        return d['profile_picture_url'] as String?;
      }
    } catch (_) {}
    return null;
  }

  // ── Follow stats ──
  static Future<Map<String, dynamic>> getFollowStats(
      String phoneNumber) async {
    final response = await http.get(
        Uri.parse("$baseUrl/users/$phoneNumber/follow-stats"));
    if (response.statusCode != 200) {
      throw Exception('Failed to load follow stats: ${response.statusCode}');
    }

    final d = jsonDecode(response.body);

    final hasFollowers = d is Map && d.containsKey('followers');
    final hasFollowing = d is Map && d.containsKey('following');
    if (!hasFollowers || !hasFollowing) {
      throw Exception('Invalid follow stats payload');
    }

    return {
      'followers': int.tryParse(d['followers'].toString()) ?? 0,
      'following': int.tryParse(d['following'].toString()) ?? 0,
    };
  }

  static Future<List<dynamic>> getFollowers(String phoneNumber) async {
    final response = await http
        .get(Uri.parse("$baseUrl/users/$phoneNumber/followers"));
    return jsonDecode(response.body);
  }

  static Future<List<dynamic>> getFollowing(String phoneNumber) async {
    final response = await http
        .get(Uri.parse("$baseUrl/users/$phoneNumber/following"));
    return jsonDecode(response.body);
  }

  // ── Follow / Unfollow ──

  /// Follow targetPhone as myPhone
  static Future<void> followUser(
      String myPhone, String targetPhone) async {
    final response = await http.post(
      Uri.parse("$baseUrl/users/$targetPhone/follow"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"follower_phone": myPhone}),
    );
    if (response.statusCode != 200) {
      throw Exception("Failed to follow user");
    }
  }

  // ── Notifications ──
  static Future<List<Map<String, dynamic>>> getNotifications(
    String phoneNumber,
  ) async {
    try {
      final res = await http
          .get(Uri.parse('$baseUrl/notifications/$phoneNumber'))
          .timeout(const Duration(seconds: 15));

      if (res.statusCode != 200) {
        throw Exception('Failed to load notifications: ${res.statusCode}');
      }

      final decoded = jsonDecode(res.body);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    } on TimeoutException {
      throw Exception('Request timeout. Please try again.');
    }
  }

  static Future<Map<String, dynamic>> createRewardNotification(
    String phoneNumber,
    String rewardName,
    String qrCode,
    dynamic expiresAt,
    int pointsUsed,
  ) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/notifications/reward'),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "phone_number": phoneNumber,
          "reward_name": rewardName,
          "qr_code": qrCode,
          "expires_at": expiresAt,
          "points_used": pointsUsed,
          "type": "reward_redemption",
        }),
      ).timeout(const Duration(seconds: 15));

      final decoded = response.body.isNotEmpty
          ? jsonDecode(response.body)
          : <String, dynamic>{};

      if (response.statusCode != 200 && response.statusCode != 201) {
        return {
          "success": false,
          "error": decoded["error"] ?? "Failed to create notification",
          ...decoded,
        };
      }

      return {
        "success": true,
        ...decoded,
      };
    } on TimeoutException {
      return {"success": false, "error": "Request timeout"};
    } catch (e) {
      return {"success": false, "error": "Error: $e"};
    }
  }

  /// Unfollow targetPhone as myPhone
  static Future<void> unfollowUser(
      String myPhone, String targetPhone) async {
    final response = await http.post(
      Uri.parse("$baseUrl/users/$targetPhone/unfollow"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"follower_phone": myPhone}),
    );
    if (response.statusCode != 200) {
      throw Exception("Failed to unfollow user");
    }
  }

  /// Returns true if myPhone is following targetPhone
  static Future<bool> checkFollowStatus(
      String myPhone, String targetPhone) async {
    try {
      final res = await http.get(
        Uri.parse(
            "$baseUrl/users/$targetPhone/follow-status?viewer_phone=$myPhone"),
      );
      if (res.statusCode == 200) {
        return jsonDecode(res.body)['is_following'] == true;
      }
    } catch (_) {}
    return false;
  }

  static Future<Map<String, dynamic>> getModerationStatus(String phoneNumber) async {
    try {
      final res = await http.get(
        Uri.parse('$baseUrl/users/$phoneNumber/moderation-status'),
      ).timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) {
        return {'is_blocked': false};
      }
      final data = jsonDecode(res.body);
      if (data is Map<String, dynamic>) return data;
      return {'is_blocked': false};
    } catch (_) {
      return {'is_blocked': false};
    }
  }

  // ── Posts ──
  static Future getPosts() async {
    try {
      final res = await http.get(Uri.parse("$baseUrl/posts"));
      if (res.statusCode != 200) return [];
      return jsonDecode(res.body) ?? [];
    } catch (e) {
      return [];
    }
  }

  static Future getUserPosts(String phone, {String? viewer}) async {
    try {
      var uri = Uri.parse("$baseUrl/users/$phone/posts");
      if (viewer != null) {
        uri = uri.replace(queryParameters: {"viewer": viewer});
      }
      final res = await http.get(uri);
      if (res.statusCode != 200) return [];
      return jsonDecode(res.body) ?? [];
    } catch (e) {
      return [];
    }
  }

  static Future<bool> createTextPost(String phone, String content,
      {int? articleId}) async {
    try {
      final req = http.MultipartRequest('POST', Uri.parse('$baseUrl/posts'));
      req.fields['phone'] = phone;
      req.fields['content'] = content;
      req.fields['visibility'] = 'public';
      if (articleId != null) {
        req.fields['linked_article_id'] = articleId.toString();
      }
      final res = await req.send().timeout(const Duration(seconds: 15));
      return res.statusCode == 201 || res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  static Future updatePost(int postId, String phone, String content,
      {List<String>? imagePaths}) async {
    var request = http.MultipartRequest(
        "PUT", Uri.parse("$baseUrl/posts/$postId"));
    request.fields["phone"] = phone;
    request.fields["content"] = content;
    if (imagePaths != null) {
      for (var path in imagePaths) {
        request.files
            .add(await http.MultipartFile.fromPath("images", path));
      }
    }
    final streamed = await request.send();
    final response = await http.Response.fromStream(streamed);
    if (response.statusCode != 200) throw Exception('Failed to update post');
    return jsonDecode(response.body);
  }

  static Future deletePost(int postId, String phone) async {
    try {
      final response = await http.delete(
        Uri.parse("$baseUrl/posts/$postId?phone=$phone"),
        headers: {"Content-Type": "application/json"},
      );
      if (response.statusCode != 200) {
        throw Exception(
            'Failed to delete post: ${response.statusCode} - ${response.body}');
      }
      return jsonDecode(response.body);
    } catch (e) {
      rethrow;
    }
  }

  // Groups
  static Future<List<dynamic>> getGroups() async {
    try {
      final res = await http.get(Uri.parse('$baseUrl/groups'));
      if (res.statusCode != 200) return [];
      return jsonDecode(res.body) as List<dynamic>;
    } catch (_) {
      return [];
    }
  }

  static Future<List<dynamic>> getGroupPosts(int groupId, String phone) async {
    try {
      final res = await http.get(
        Uri.parse('$baseUrl/groups/$groupId/posts?phone=$phone'),
      );
      if (res.statusCode != 200) return [];
      return jsonDecode(res.body) as List<dynamic>;
    } catch (_) {
      return [];
    }
  }

  static Future<Map<String, dynamic>> getGroupStatus(int groupId, String phone) async {
    try {
      final res = await http.get(
        Uri.parse('$baseUrl/groups/$groupId/status?phone=$phone'),
      );
      if (res.statusCode != 200) return {'is_member': false};
      final data = jsonDecode(res.body);
      return data is Map<String, dynamic> ? data : {'is_member': false};
    } catch (_) {
      return {'is_member': false};
    }
  }

  static Future<bool> joinGroup(int groupId, String phone) async {
    try {
      final res = await http.post(
        Uri.parse('$baseUrl/groups/$groupId/join'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': phone}),
      );
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> leaveGroup(int groupId, String phone) async {
    try {
      final res = await http.delete(
        Uri.parse('$baseUrl/groups/$groupId/leave?phone=$phone'),
      );
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  // ── Profile Details ──
  static Future<Map<String, dynamic>> getProfileDetails(String phoneNumber) async {
    try {
      final res = await http.get(
        Uri.parse('$baseUrl/users/$phoneNumber/profile-details'),
      );
      if (res.statusCode == 200) {
        return jsonDecode(res.body) as Map<String, dynamic>;
      }
    } catch (_) {}
    return {
      'current_location': null,
      'hometown': null,
      'birth_date': null,
      'relationship_status': null,
      'family_info': null,
      'gender': null,
      'pronouns': null,
    };
  }

  static Future<void> updateProfileDetails(String phoneNumber, Map<String, dynamic> details) async {
    try {
      final res = await http.put(
        Uri.parse('$baseUrl/users/$phoneNumber/profile-details'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(details),
      );
      if (res.statusCode != 200) {
        throw Exception('Failed to update profile details: ${res.statusCode}');
      }
    } catch (e) {
      throw Exception('Error updating profile details: $e');
    }
  }

  // ── Partners ──

  static Future<List<Map<String, dynamic>>> getPartners() async {
    try {
      final res = await http
          .get(Uri.parse('$baseUrl/partners'))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<Map<String, dynamic>?> getPartnerById(int id) async {
    try {
      final res = await http
          .get(Uri.parse('$baseUrl/partners/$id'))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return null;
      final data = jsonDecode(res.body);
      return data is Map<String, dynamic> ? data : null;
    } catch (_) {
      return null;
    }
  }

  static Future<List<Map<String, dynamic>>> getPartnerJobs() async {
    try {
      final res = await http
          .get(Uri.parse('$baseUrl/partners/jobs'))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return [];
    }
  }

  // ── Home Banners ──

  static Future<List<Map<String, dynamic>>> getHomeBanners({String? type}) async {
    try {
      var uri = Uri.parse('$baseUrl/banners');
      if (type != null) uri = uri.replace(queryParameters: {'type': type});
      final res = await http.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return [];
    }
  }

  // ── Articles ──

  static Future<List<Map<String, dynamic>>> getArticles({
    String? category,
    int page = 1,
    String? phone,
    String? sort,
    int? limit,
  }) async {
    try {
      final params = <String, String>{'page': '$page'};
      if (category != null) params['category'] = category;
      if (phone != null) params['phone'] = phone;
      if (sort != null) params['sort'] = sort;
      if (limit != null) params['limit'] = '$limit';
      final uri = Uri.parse('$baseUrl/articles').replace(queryParameters: params);
      final res = await http.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<Map<String, dynamic>?> getArticleById(int id, {String? phone}) async {
    try {
      var uri = Uri.parse('$baseUrl/articles/$id');
      if (phone != null) uri = uri.replace(queryParameters: {'phone': phone});
      final res = await http.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return null;
      final data = jsonDecode(res.body);
      return data is Map<String, dynamic> ? data : null;
    } catch (_) {
      return null;
    }
  }

  static Future<void> viewArticle(int id) async {
    try {
      await http
          .post(Uri.parse('$baseUrl/articles/$id/view'))
          .timeout(const Duration(seconds: 10));
    } catch (_) {}
  }

  static Future<Map<String, dynamic>> likeArticle(int id, String phone) async {
    try {
      final res = await http
          .post(
            Uri.parse('$baseUrl/articles/$id/like'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'phone_number': phone}),
          )
          .timeout(const Duration(seconds: 10));
      final data = jsonDecode(res.body);
      return data is Map<String, dynamic> ? data : {};
    } catch (_) {
      return {};
    }
  }

  static Future<void> shareArticle(int id) async {
    try {
      await http
          .post(Uri.parse('$baseUrl/articles/$id/share'))
          .timeout(const Duration(seconds: 10));
    } catch (_) {}
  }

  static Future<List<Map<String, dynamic>>> getArticleComments(int id) async {
    try {
      final res = await http
          .get(Uri.parse('$baseUrl/articles/$id/comments'))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<Map<String, dynamic>> addArticleComment(
      int id, String phone, String content) async {
    try {
      final res = await http
          .post(
            Uri.parse('$baseUrl/articles/$id/comments'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'phone_number': phone, 'content': content}),
          )
          .timeout(const Duration(seconds: 15));
      final data = jsonDecode(res.body);
      return data is Map<String, dynamic> ? data : {};
    } catch (e) {
      return {'error': '$e'};
    }
  }

  static Future<bool> deleteArticleComment(
      int articleId, int commentId, String phone) async {
    try {
      final res = await http
          .delete(
            Uri.parse('$baseUrl/articles/$articleId/comments/$commentId'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'phone_number': phone}),
          )
          .timeout(const Duration(seconds: 10));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  static Future<List<Map<String, dynamic>>> getMyArticles(String phone) async {
    try {
      final res = await http
          .get(Uri.parse('$baseUrl/articles/my/$phone'))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<Map<String, dynamic>> submitArticle({
    required String phoneNumber,
    required String title,
    required String authorName,
    String? summary,
    String? headline,
    String? introduction,
    String? body,
    String? conclusion,
    required String category,
    dynamic coverImage,
  }) async {
    try {
      final uri = Uri.parse('$baseUrl/articles/submit');
      final request = http.MultipartRequest('POST', uri);
      request.fields['phone_number'] = phoneNumber;
      request.fields['title'] = title;
      request.fields['author_name'] = authorName;
      request.fields['category'] = category;
      if (summary?.isNotEmpty == true) request.fields['summary'] = summary!;
      if (headline?.isNotEmpty == true) request.fields['headline'] = headline!;
      if (introduction?.isNotEmpty == true) request.fields['introduction'] = introduction!;
      if (body?.isNotEmpty == true) request.fields['body'] = body!;
      if (conclusion?.isNotEmpty == true) request.fields['conclusion'] = conclusion!;
      if (coverImage != null) {
        request.files.add(await http.MultipartFile.fromPath('cover_image', coverImage.path));
      }
      final streamed = await request.send().timeout(const Duration(seconds: 30));
      final res = await http.Response.fromStream(streamed);
      final decoded = res.body.isNotEmpty ? jsonDecode(res.body) : <String, dynamic>{};
      return decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
    } catch (e) {
      return {'error': 'Connection error: $e'};
    }
  }

  static Future<List<Map<String, dynamic>>> getArticlesByUserId(int userId) async {
    try {
      final res = await http
          .get(Uri.parse('$baseUrl/articles/user/$userId'))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Map<String, dynamic>>> getArticleRanking({int limit = 50}) async {
    try {
      final res = await http
          .get(Uri.parse('$baseUrl/articles/ranking?limit=$limit'))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body);
      final list = data is Map ? data['ranking'] : data;
      if (list is! List) return [];
      return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return [];
    }
  }

}