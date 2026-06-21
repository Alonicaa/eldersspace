import 'package:flutter/material.dart';
import 'services/reward_service.dart';

/// Points System Page (ระบบแต้มสะสม)
/// แสดงวิธีการได้แต้มและกฎการใช้งาน
class PointsSystemPage extends StatefulWidget {
  final String phoneNumber;

  const PointsSystemPage({
    super.key,
    required this.phoneNumber,
  });

  @override
  State<PointsSystemPage> createState() => _PointsSystemPageState();
}

class _PointsSystemPageState extends State<PointsSystemPage> {
  Map<String, dynamic>? _rewardSettings;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadRewardSettings();
  }

  Future<void> _loadRewardSettings() async {
    try {
      final settings = await RewardService.getRewardSettings();
      if (!mounted) return;
      
      setState(() {
        _rewardSettings = settings;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'ไม่สามารถโหลดข้อมูลระบบแต้มได้: $e';
        _isLoading = false;
      });
    }
  }

  int _asInt(dynamic value, {int fallback = 0}) {
    if (value == null) return fallback;
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value.toString()) ?? fallback;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ระบบแต้มสะสม'),
        backgroundColor: Colors.blue[700],
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadRewardSettings,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      // ส่วนที่ 1: วิธีการได้แต้ม
                      _buildEarningWaysSection(),
                      const SizedBox(height: 24),

                      // ส่วนที่ 2: ข้อมูลการใช้งาน
                      _buildAppUsageSection(),
                      const SizedBox(height: 24),

                      // ส่วนที่ 3: เช็คอินรายวัน
                      _buildDailyCheckInSection(),
                      const SizedBox(height: 24),

                      // ส่วนที่ 4: กิจกรรมเพิ่มเติม
                      _buildActivityRewardsSection(),
                      const SizedBox(height: 24),

                      // ส่วนที่ 5: บอนัสอื่นๆ
                      _buildBonusEventsSection(),
                      const SizedBox(height: 24),

                      // ส่วนที่ 6: คำแนะนำ
                      _buildTipsSection(),
                    ],
                  ),
                ),
    );
  }

  // 1️⃣ วิธีการได้แต้ม (Overview)
  Widget _buildEarningWaysSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader('🎯 วิธีการได้แต้ม'),
        const SizedBox(height: 12),
        _buildWayCard(
          icon: '⏱️',
          title: 'ใช้งานแอพ',
          description: 'ใช้งานแอพให้ครบเวลาที่กำหนด',
          color: Colors.blue,
        ),
        const SizedBox(height: 8),
        _buildWayCard(
          icon: '🔑',
          title: 'เช็คอินรายวัน',
          description: 'เข้ามาใช้แอพทุกวัน ได้แต้มพิเศษ',
          color: Colors.blue,
        ),
        const SizedBox(height: 8),
        _buildWayCard(
          icon: '📝',
          title: 'โพสต์และแสดงความเห็น',
          description: 'สร้างเนื้อหาและส่วนสนใจ',
          color: Colors.orange,
        ),
        const SizedBox(height: 8),
        _buildWayCard(
          icon: '⭐',
          title: 'ข้อมูลประจำตัว',
          description: 'เติมเต็มข้อมูลโปรไฟล์อย่างสมบูรณ์',
          color: Colors.purple,
        ),
      ],
    );
  }

  Widget _buildWayCard({
    required String icon,
    required String title,
    required String description,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: color.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(8),
        color: color.withValues(alpha: 0.05),
      ),
      child: Row(
        children: [
          Text(
            icon,
            style: const TextStyle(fontSize: 24),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                Text(
                  description,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // 2️⃣ ข้อมูลการใช้งานแอพ
  Widget _buildAppUsageSection() {
    final threshold = _asInt(
      _rewardSettings?['session_bonus_threshold'],
      fallback: 40,
    );
    final points = _asInt(
      _rewardSettings?['session_bonus_points'],
      fallback: 8,
    );
    final dailyLimit = _asInt(
      _rewardSettings?['usage_reward_daily_limit_count'],
      fallback: 2,
    );
    final maxPoints = points * dailyLimit;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader('⏱️ ใช้งานแอพให้ครบเวลา'),
        const SizedBox(height: 12),
        _buildInfoCard(
          items: [
            ('ใช้งานครบ', '$threshold นาที'),
            ('ได้รับแต้ม', '+$points แต้ม'),
            ('สูงสุดต่อวัน', '$dailyLimit ครั้ง'),
            ('แต้มสูงสุดต่อวัน', '+$maxPoints แต้ม'),
          ],
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.blue[50],
            border: Border.all(color: Colors.blue[200]!),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              Icon(Icons.info_outline, color: Colors.blue[700], size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'ใช้งานแอพต่อเนื่องจะได้แต้มเมื่อครบเวลา\nโปรแกรมจะนับเวลาโดยอัตโนมัติ',
                  style: TextStyle(fontSize: 12, color: Colors.blue[900]),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // 3️⃣ เช็คอินรายวัน
  Widget _buildDailyCheckInSection() {
    final dailyBonus = _asInt(
      _rewardSettings?['daily_login_bonus'],
      fallback: 5,
    );
    final streakDays = _asInt(
      _rewardSettings?['streak_milestone_days'],
      fallback: 30,
    );
    final streakBonus = _asInt(
      _rewardSettings?['streak_milestone_bonus'],
      fallback: 2,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader('🔑 เช็คอินรายวัน'),
        const SizedBox(height: 12),
        _buildInfoCard(
          items: [
            ('เช็คอินธรรมดา', '+$dailyBonus แต้ม'),
            ('โบนัส Streak ทุก', '$streakDays วัน'),
            ('แต้มโบนัส Streak', '+$streakBonus แต้ม'),
            ('รีเซ็ต', 'เวลา 00:00 (เวลา Bangkok)'),
          ],
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.blue[50],
            border: Border.all(color: Colors.blue[200]!),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              Icon(Icons.check_circle_outline, color: Colors.blue[700], size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'เช็คอินทุกวันเพื่อรักษา Streak ไว้\nหลาย Streak = แต้มโบนัสมากขึ้น',
                  style: TextStyle(fontSize: 12, color: Colors.blue[900]),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // 4️⃣ กิจกรรมเพิ่มเติม
  Widget _buildActivityRewardsSection() {
    final profilePoints = _asInt(
      _rewardSettings?['profile_completion_points'],
      fallback: 50,
    );
    final postPoints = _asInt(
      _rewardSettings?['post_activity_points'],
      fallback: 10,
    );
    final postRequired = _asInt(
      _rewardSettings?['post_activity_required_posts'],
      fallback: 2,
    );
    final commentPoints = _asInt(
      _rewardSettings?['comment_activity_points'],
      fallback: 2,
    );
    final commentLimit = _asInt(
      _rewardSettings?['comment_activity_daily_limit_count'],
      fallback: 5,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader('📊 กิจกรรมเพิ่มเติม'),
        const SizedBox(height: 12),
        _buildActivityCard(
          icon: '✅',
          title: 'ข้อมูลประจำตัวสมบูรณ์',
          subtitle: '(ครั้งเดียว)',
          points: profilePoints,
          color: Colors.purple,
        ),
        const SizedBox(height: 8),
        _buildActivityCard(
          icon: '📝',
          title: 'โพสต์จำนวนมาก',
          subtitle: 'โพสต์ $postRequired ครั้งขึ้นไป/วัน',
          points: postPoints,
          color: Colors.orange,
        ),
        const SizedBox(height: 8),
        _buildActivityCard(
          icon: '💬',
          title: 'แสดงความเห็น',
          subtitle: 'สูงสุด $commentLimit ครั้ง/วัน',
          points: commentPoints,
          color: Colors.cyan,
        ),
      ],
    );
  }

  Widget _buildActivityCard({
    required String icon,
    required String title,
    required String subtitle,
    required int points,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: color.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(8),
        color: color.withValues(alpha: 0.05),
      ),
      child: Row(
        children: [
          Text(
            icon,
            style: const TextStyle(fontSize: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              '+$points',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // 5️⃣ บอนัสอื่นๆ
  Widget _buildBonusEventsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader('🎉 บอนัสพิเศษ'),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.amber[50],
            border: Border.all(color: Colors.amber[200]!),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.card_giftcard, color: Colors.amber[700], size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'ติดตามบอนัสพิเศษ',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: Colors.amber[900],
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'อาจมีบอนัสพิเศษเพิ่มเติมตามช่วงเวลา\nหรือกิจกรรมพิเศษ ติดตามข่าวสารจากแอพ',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.amber[900],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // 6️⃣ คำแนะนำ
  Widget _buildTipsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader('💡 คำแนะนำ'),
        const SizedBox(height: 12),
        _buildTipCard(
          '✨ ท่องปกติ',
          'ใช้งานแอพทุกวัน และเช็คอินเพื่อสะสมแต้มอย่างต่อเนื่อง',
        ),
        const SizedBox(height: 8),
        _buildTipCard(
          '🎯 มีตัวเลือก',
          'กรอกข้อมูลโปรไฟล์ให้สมบูรณ์เพื่อได้แต้มโบนัสเพิ่มเติม',
        ),
        const SizedBox(height: 8),
        _buildTipCard(
          '🤝 มีส่วนร่วม',
          'โพสต์แสดงความเห็น และมีปฏิสัมพันธ์ในชุมชน',
        ),
        const SizedBox(height: 8),
        _buildTipCard(
          '🏆 สะสม Streak',
          'ยิ่งมี Streak ยาว ยิ่งได้โบนัสมาก',
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.grey[100],
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              Icon(Icons.info_outline, color: Colors.grey[700], size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'แต้มที่ได้สามารถแลกเปลี่ยนกับรางวัลและสิทธิประโยชน์ต่างๆ',
                  style: TextStyle(fontSize: 12, color: Colors.grey[700]),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTipCard(String title, String description) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey[300]!),
        borderRadius: BorderRadius.circular(8),
        color: Colors.grey[50],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            description,
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey[600],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: Color(0xFF3B6FD4),
      ),
    );
  }

  Widget _buildInfoCard({required List<(String, String)> items}) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        border: Border.all(color: Colors.grey[300]!),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: items
            .asMap()
            .entries
            .map((e) {
              final isLast = e.key == items.length - 1;
              return Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        e.value.$1,
                        style: const TextStyle(
                          fontSize: 13,
                          color: Colors.grey,
                        ),
                      ),
                      Text(
                        e.value.$2,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                  if (!isLast) ...[
                    const SizedBox(height: 8),
                    Divider(color: Colors.grey[300], height: 1),
                    const SizedBox(height: 8),
                  ],
                ],
              );
            })
            .toList(),
      ),
    );
  }
}
