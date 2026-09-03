import 'package:flutter/material.dart';

class AppFooter extends StatelessWidget {
  const AppFooter({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 15, horizontal: 20),
      decoration: BoxDecoration(
        color: const Color(0xFF1a1a2e),
        border: Border(
          top: BorderSide(color: Colors.white.withOpacity(0.1)),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Divider line
          Container(
            width: 50,
            height: 3,
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF667eea), Color(0xFF764ba2)]),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 10),

          // Main footer title
          const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.translate, color: Color(0xFF667eea), size: 16),
              SizedBox(width: 5),
              Text(
                '🌐 LingoLink AI',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),

          // Tagline
          Text(
            'Enterprise AI Translation Platform',
            style: TextStyle(
              color: Colors.grey.withOpacity(0.7),
              fontSize: 11,
            ),
          ),
          const SizedBox(height: 8),

          // Copyright
          Text(
            '© 2026 LingoLink AI. All rights reserved.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.grey.withOpacity(0.5),
              fontSize: 10,
            ),
          ),
          const SizedBox(height: 8),

          // Feature badges
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _buildFooterBadge(Icons.lock, 'Secure'),
              const SizedBox(width: 10),
              _buildFooterBadge(Icons.speed, 'Fast'),
              const SizedBox(width: 10),
              _buildFooterBadge(Icons.language, '50+ Languages'),
              const SizedBox(width: 10),
              _buildFooterBadge(Icons.support_agent, '24/7 Support'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFooterBadge(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withOpacity(0.1)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: const Color(0xFF667eea), size: 12),
          const SizedBox(width: 5),
          Text(
            text,
            style: TextStyle(color: Colors.grey.withOpacity(0.7), fontSize: 9),
          ),
        ],
      ),
    );
  }
}