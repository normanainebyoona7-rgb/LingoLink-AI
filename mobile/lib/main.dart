import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'dart:typed_data';
import 'package:record/record.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:audio_waveforms/audio_waveforms.dart';
import 'sidebar.dart';

void main() {
  runApp(const LingoLinkApp());
}

class LingoLinkApp extends StatelessWidget {
  const LingoLinkApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LingoLink AI',
      theme: ThemeData(
        primarySwatch: Colors.blue,
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0f0c29),
      ),
      home: const AuthScreen(),
      debugShowCheckedModeBanner: false,
    );
  }
}

// ==================== AUTH SCREEN ====================
class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final TextEditingController _usernameController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _showLogin = true;
  bool _isLoading = false;

  Future<void> _login() async {
    if (_usernameController.text.isEmpty || _passwordController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please enter username and password')));
      return;
    }
    setState(() => _isLoading = true);
    try {
      final response = await http.post(
        Uri.parse('http://127.0.0.1:8000/auth/login'),
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: 'username=${_usernameController.text}&password=${_passwordController.text}',
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => HomeScreen(
          token: data['access_token'], username: data['username'],
          isPremium: data['is_premium'] ?? false, isAdmin: data['is_admin'] ?? false,
        )));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Login failed')));
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _register() async {
    if (_usernameController.text.isEmpty || _emailController.text.isEmpty || _passwordController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please fill all fields')));
      return;
    }
    setState(() => _isLoading = true);
    try {
      final response = await http.post(
        Uri.parse('http://127.0.0.1:8000/auth/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'username': _usernameController.text, 'email': _emailController.text, 'password': _passwordController.text}),
      );
      if (response.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Registration successful!')));
        setState(() { _showLogin = true; _usernameController.clear(); _emailController.clear(); _passwordController.clear(); });
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Registration failed: $e')));
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: const BoxDecoration(
              gradient: LinearGradient(colors: [Color(0xFF667eea), Color(0xFF764ba2)]),
              borderRadius: BorderRadius.only(bottomLeft: Radius.circular(30), bottomRight: Radius.circular(30)),
            ),
            child: const SafeArea(
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Text('🌐 LingoLink AI', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
              ]),
            ),
          ),
          Expanded(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(30.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text('Enterprise AI Translation', textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: Colors.grey)),
                    const SizedBox(height: 30),
                    Row(children: [
                      Expanded(child: ElevatedButton(onPressed: () => setState(() => _showLogin = true), style: ElevatedButton.styleFrom(backgroundColor: _showLogin ? Colors.blue : Colors.grey[800], padding: const EdgeInsets.symmetric(vertical: 12)), child: const Text('Login'))),
                      const SizedBox(width: 10),
                      Expanded(child: ElevatedButton(onPressed: () => setState(() => _showLogin = false), style: ElevatedButton.styleFrom(backgroundColor: !_showLogin ? Colors.blue : Colors.grey[800], padding: const EdgeInsets.symmetric(vertical: 12)), child: const Text('Register'))),
                    ]),
                    const SizedBox(height: 20),
                    Card(
                      color: const Color(0xFF1a1a2e),
                      elevation: 4,
                      child: Padding(
                        padding: const EdgeInsets.all(20.0),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          Text(_showLogin ? 'Login' : 'Register', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white)),
                          const SizedBox(height: 15),
                          TextField(controller: _usernameController, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(labelText: 'Username', labelStyle: TextStyle(color: Colors.grey), border: OutlineInputBorder())),
                          if (!_showLogin) ...[
                            const SizedBox(height: 10),
                            TextField(controller: _emailController, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(labelText: 'Email', labelStyle: TextStyle(color: Colors.grey), border: OutlineInputBorder())),
                          ],
                          const SizedBox(height: 10),
                          TextField(controller: _passwordController, obscureText: true, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(labelText: 'Password', labelStyle: TextStyle(color: Colors.grey), border: OutlineInputBorder())),
                          const SizedBox(height: 20),
                          ElevatedButton(onPressed: _isLoading ? null : (_showLogin ? _login : _register), style: ElevatedButton.styleFrom(backgroundColor: Colors.green, padding: const EdgeInsets.symmetric(vertical: 15)), child: Text(_isLoading ? 'Please wait...' : (_showLogin ? 'Login' : 'Register'), style: const TextStyle(fontSize: 16, color: Colors.white))),
                        ]),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Container(padding: const EdgeInsets.all(10), child: const Text('© 2026 LingoLink AI. All rights reserved.', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey, fontSize: 12))),
        ],
      ),
    );
  }
}

// ==================== HOME SCREEN ====================
class HomeScreen extends StatefulWidget {
  final String token;
  final String username;
  final bool isPremium;
  final bool isAdmin;

  const HomeScreen({super.key, required this.token, required this.username, required this.isPremium, this.isAdmin = false});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final TextEditingController _textController = TextEditingController();
  final TextEditingController _sourceSearchController = TextEditingController();
  final TextEditingController _targetSearchController = TextEditingController();
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _player = AudioPlayer();
  final RecorderController _waveformController = RecorderController();

  String _translatedText = '';
  String _sourceLanguage = 'english';
  String _targetLanguage = 'spanish';
  String _sourceSearch = '';
  String _targetSearch = '';
  bool _isLoading = false;
  bool _isRecording = false;
  bool _isPremium = false;
  int _currentTab = 0;
  bool _sidebarVisible = true;
  List<dynamic> _history = [];
  List<dynamic> _callQueue = [];
  String? _activeCall;
  List<Map<String, String>> _transcript = [];
  String _subtitleLanguage = 'luganda';
  List<String> _liveSubtitles = [];
  Map<String, dynamic>? _adminDashboard;
  List<dynamic> _adminUsers = [];
  bool _isPttMode = false;
  bool _isListening = false;
  String _speakerA = 'english';
  String _speakerB = 'luganda';
  bool _isSpeakerATurn = true;
  bool _isOfflineMode = false;

  final List<Map<String, String>> _languages = [
    {'code': 'english', 'name': 'English'},
    {'code': 'spanish', 'name': 'Spanish'},
    {'code': 'french', 'name': 'French'},
    {'code': 'german', 'name': 'German'},
    {'code': 'portuguese', 'name': 'Portuguese'},
    {'code': 'italian', 'name': 'Italian'},
    {'code': 'dutch', 'name': 'Dutch'},
    {'code': 'russian', 'name': 'Russian'},
    {'code': 'arabic', 'name': 'Arabic'},
    {'code': 'hindi', 'name': 'Hindi'},
    {'code': 'chinese', 'name': 'Chinese'},
    {'code': 'japanese', 'name': 'Japanese'},
    {'code': 'korean', 'name': 'Korean'},
    {'code': 'turkish', 'name': 'Turkish'},
    {'code': 'luganda', 'name': 'Luganda'},
    {'code': 'rukiga', 'name': 'Rukiga'},
    {'code': 'runyankole', 'name': 'Runyankole'},
    {'code': 'acholi', 'name': 'Acholi'},
    {'code': 'alur', 'name': 'Alur'},
    {'code': 'ateso', 'name': 'Ateso'},
    {'code': 'lango', 'name': 'Lango'},
    {'code': 'lugbara', 'name': 'Lugbara'},
    {'code': 'lusoga', 'name': 'Lusoga'},
    {'code': 'lugwere', 'name': 'Lugwere'},
    {'code': 'swahili', 'name': 'Swahili'},
    {'code': 'kinyarwanda', 'name': 'Kinyarwanda'},
    {'code': 'kirundi', 'name': 'Kirundi'},
    {'code': 'amharic', 'name': 'Amharic'},
    {'code': 'somali', 'name': 'Somali'},
    {'code': 'oromo', 'name': 'Oromo'},
    {'code': 'tigrinya', 'name': 'Tigrinya'},
    {'code': 'kikuyu', 'name': 'Kikuyu'},
    {'code': 'dholuo', 'name': 'Dholuo'},
    {'code': 'yoruba', 'name': 'Yoruba'},
    {'code': 'hausa', 'name': 'Hausa'},
    {'code': 'igbo', 'name': 'Igbo'},
    {'code': 'fulfulde', 'name': 'Fulfulde'},
    {'code': 'wolof', 'name': 'Wolof'},
    {'code': 'bambara', 'name': 'Bambara'},
    {'code': 'twi', 'name': 'Twi'},
    {'code': 'ewe', 'name': 'Ewe'},
    {'code': 'lingala', 'name': 'Lingala'},
    {'code': 'kikongo', 'name': 'Kikongo'},
    {'code': 'bemba', 'name': 'Bemba'},
    {'code': 'chichewa', 'name': 'Chichewa'},
    {'code': 'zulu', 'name': 'Zulu'},
    {'code': 'xhosa', 'name': 'Xhosa'},
    {'code': 'afrikaans', 'name': 'Afrikaans'},
    {'code': 'sesotho', 'name': 'Sesotho'},
    {'code': 'setswana', 'name': 'Setswana'},
    {'code': 'shona', 'name': 'Shona'},
    {'code': 'kabyle', 'name': 'Kabyle'},
    {'code': 'tachelhit', 'name': 'Tachelhit'},
  ];

  @override
  void initState() {
    super.initState();
    _isPremium = widget.isPremium;
  }

  List<Map<String, String>> _filterLanguages(String search) {
    if (search.isEmpty) return _languages;
    return _languages.where((lang) =>
      lang['name']!.toLowerCase().contains(search.toLowerCase()) ||
      lang['code']!.toLowerCase().contains(search.toLowerCase())
    ).toList();
  }

  Future<void> _requestPermissions() async {
    await Permission.microphone.request();
  }

  Future<void> _loadOfflineModels() async {
    setState(() => _isOfflineMode = true);
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('✅ Offline mode enabled!')));
  }

  Future<void> _translateText() async {
    if (_textController.text.isEmpty) return;
    if (_isOfflineMode) {
      final result = await _offlineTranslate(_textController.text, _sourceLanguage, _targetLanguage);
      setState(() => _translatedText = result);
      return;
    }
    setState(() { _isLoading = true; _translatedText = ''; });
    try {
      final response = await http.post(
        Uri.parse('http://127.0.0.1:8000/translate/text'),
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ${widget.token}'},
        body: jsonEncode({'text': _textController.text, 'source_language': _sourceLanguage, 'target_language': _targetLanguage, 'user_id': 1}),
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        setState(() { _translatedText = data['translated_text']; });
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Translation error: $e')));
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<String> _offlineTranslate(String text, String sourceLang, String targetLang) async {
    final offlineDict = {
      'english_luganda': {'good morning': 'wasuze otya', 'thank you': 'webale', 'hello': 'ki kati'},
      'english_swahili': {'good morning': 'habari za asubuhi', 'thank you': 'asante', 'hello': 'jambo'},
    };
    final key = '${sourceLang}_$targetLang';
    final textLower = text.toLowerCase();
    if (offlineDict.containsKey(key)) {
      for (var entry in offlineDict[key]!.entries) {
        if (textLower.contains(entry.key)) return entry.value;
      }
    }
    return text;
  }

  Future<void> _fetchHistory() async {
    try {
      final response = await http.get(Uri.parse('http://127.0.0.1:8000/translate/history'), headers: {'Authorization': 'Bearer ${widget.token}'});
      if (response.statusCode == 200) setState(() { _history = jsonDecode(response.body); });
    } catch (e) {}
  }

  Future<void> _fetchAdminDashboard() async {
    try {
      final response = await http.get(Uri.parse('http://127.0.0.1:8000/admin/dashboard'), headers: {'Authorization': 'Bearer ${widget.token}'});
      if (response.statusCode == 200) setState(() { _adminDashboard = jsonDecode(response.body); });
    } catch (e) {}
    try {
      final response = await http.get(Uri.parse('http://127.0.0.1:8000/admin/users'), headers: {'Authorization': 'Bearer ${widget.token}'});
      if (response.statusCode == 200) setState(() { _adminUsers = jsonDecode(response.body); });
    } catch (e) {}
  }

  Future<void> _startRecording() async {
    try {
      if (await _recorder.hasPermission()) {
        await _recorder.start(const RecordConfig(encoder: AudioEncoder.wav), path: 'recording.wav');
        setState(() => _isRecording = true);
      }
    } catch (e) {}
  }

  Future<void> _stopRecording() async {
    try {
      final path = await _recorder.stop();
      setState(() => _isRecording = false);
      if (path != null) await _sendAudioForTranscription(path);
    } catch (e) {}
  }

  Future<void> _sendAudioForTranscription(String audioPath) async {
    setState(() => _isLoading = true);
    try {
      final request = http.MultipartRequest('POST', Uri.parse('http://127.0.0.1:8000/speech/transcribe'));
      request.headers['Authorization'] = 'Bearer ${widget.token}';
      request.files.add(await http.MultipartFile.fromPath('file', audioPath));
      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        setState(() { _textController.text = data['text'] ?? ''; });
      }
    } catch (e) {} finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _speakTranslation() async {
    if (_translatedText.isEmpty) return;
    try {
      final response = await http.post(Uri.parse('http://127.0.0.1:8000/tts/speak?text=${Uri.encodeComponent(_translatedText)}&language=$_targetLanguage&voice=female'));
      if (response.statusCode == 200) await _player.play(BytesSource(response.bodyBytes));
    } catch (e) {}
  }

  void _simulateIncomingCall() {
    final languages = ['Luganda', 'Swahili', 'Acholi', 'English'];
    final randomLang = languages[DateTime.now().millisecondsSinceEpoch % languages.length];
    setState(() { _callQueue.add({'caller': 'Caller ${_callQueue.length + 1}', 'language': randomLang}); });
  }

  void _acceptCall(int index) {
    setState(() {
      _activeCall = _callQueue[index]['caller'];
      _callQueue.removeAt(index);
      _transcript = [
        {'speaker': 'Caller', 'text': 'Good morning, I need help', 'language': 'Luganda'},
        {'speaker': 'Agent', 'text': 'Good morning! How can I assist?', 'language': 'English'},
      ];
    });
  }

  void _endCall() => setState(() { _activeCall = null; _transcript = []; });

  Future<void> _startPtt() async {
    await _requestPermissions();
    setState(() { _isPttMode = true; _isListening = true; });
    await _startRecording();
  }

  Future<void> _stopPtt() async {
    setState(() { _isListening = false; });
    await _stopRecording();
  }

  void _switchSpeaker() {
    setState(() {
      _isSpeakerATurn = !_isSpeakerATurn;
      _sourceLanguage = _isSpeakerATurn ? _speakerA : _speakerB;
      _targetLanguage = _isSpeakerATurn ? _speakerB : _speakerA;
      _translatedText = '';
      _textController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('🌐 LingoLink AI'),
        backgroundColor: const Color(0xFF1a1a2e),
        leading: Builder(
          builder: (context) => IconButton(
            icon: const Icon(Icons.menu, color: Colors.white),
            onPressed: () => Scaffold.of(context).openDrawer(),
          ),
        ),
        actions: [
          Padding(padding: const EdgeInsets.only(right: 10.0), child: Center(child: Text('👤 ${widget.username} ${_isPremium ? '⭐' : ''}', style: const TextStyle(color: Colors.white)))),
          IconButton(icon: const Icon(Icons.logout, color: Colors.red), onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const AuthScreen()))),
        ],
      ),
      drawer: AppSidebar(
        currentTab: _currentTab,
        isAdmin: widget.isAdmin,
        onTabSelected: (index) {
          setState(() => _currentTab = index);
          if (index == 1) _fetchHistory();
          if (index == 5) _fetchAdminDashboard();
        },
      ),
      body: Column(
        children: [
          Expanded(child: _buildMainContent()),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: const BoxDecoration(
              color: Color(0xFF1a1a2e),
              border: Border(top: BorderSide(color: Colors.white24)),
            ),
            child: const Text('© 2026 LingoLink AI — Enterprise AI Translation Platform. All rights reserved.', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey, fontSize: 11)),
          ),
        ],
      ),
    );
  }

  Widget _buildMainContent() {
    switch (_currentTab) {
      case 0: return _buildTranslateTab();
      case 1: return _buildHistoryTab();
      case 2: return _buildCallCenterTab();
      case 3: return _buildPttTab();
      case 4: return _buildVideoTab();
      case 5: return _buildAdminTab();
      default: return _buildTranslateTab();
    }
  }

  Widget _buildTranslateTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SwitchListTile(title: const Text('📡 Offline Mode', style: TextStyle(color: Colors.white)), value: _isOfflineMode, onChanged: (value) async { if (value) await _loadOfflineModels(); else setState(() => _isOfflineMode = false); }),
          const SizedBox(height: 10),
          // Source: Default dropdown OR search
          Row(children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                value: _sourceLanguage,
                dropdownColor: const Color(0xFF1a1a2e),
                style: const TextStyle(color: Colors.white, fontSize: 13),
                decoration: InputDecoration(
                  labelText: 'From (Default)',
                  labelStyle: const TextStyle(color: Colors.grey, fontSize: 12),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  filled: true,
                  fillColor: const Color(0xFF1a1a2e),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 10),
                ),
                items: _languages.map((lang) => DropdownMenuItem(value: lang['code'], child: Text(lang['name']!, overflow: TextOverflow.ellipsis))).toList(),
                onChanged: (value) => setState(() { _sourceLanguage = value!; _sourceSearchController.text = ''; _sourceSearch = ''; }),
              ),
            ),
            const SizedBox(width: 10),
            IconButton(
              icon: const Icon(Icons.search, color: Colors.blue),
              onPressed: () => showDialog(
                context: context,
                builder: (context) => AlertDialog(
                  backgroundColor: const Color(0xFF1a1a2e),
                  title: const Text('Search Source Language', style: TextStyle(color: Colors.white)),
                  content: TextField(
                    autofocus: true,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(hintText: 'Type language...', hintStyle: TextStyle(color: Colors.grey)),
                    onChanged: (value) => setState(() => _sourceSearch = value),
                  ),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel', style: TextStyle(color: Colors.grey))),
                  ],
                ),
              ),
            ),
          ]),
          if (_sourceSearch.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 5),
              padding: const EdgeInsets.symmetric(horizontal: 10),
              decoration: BoxDecoration(color: const Color(0xFF1a1a2e), borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.blue.withOpacity(0.5))),
              child: Wrap(
                spacing: 8,
                children: _filterLanguages(_sourceSearch).take(20).map((lang) => ChoiceChip(
                  label: Text(lang['name']!, style: const TextStyle(color: Colors.white, fontSize: 12)),
                  selected: _sourceLanguage == lang['code'],
                  selectedColor: Colors.blue,
                  backgroundColor: Colors.transparent,
                  onSelected: (selected) {
                    setState(() { _sourceLanguage = lang['code']!; _sourceSearch = ''; });
                    Navigator.pop(context);
                  },
                )).toList(),
              ),
            ),
          const SizedBox(height: 15),
          const Center(child: Icon(Icons.arrow_downward, color: Colors.blue, size: 20)),
          const SizedBox(height: 15),
          // Target: Default dropdown OR search
          Row(children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                value: _targetLanguage,
                dropdownColor: const Color(0xFF1a1a2e),
                style: const TextStyle(color: Colors.white, fontSize: 13),
                decoration: InputDecoration(
                  labelText: 'To (Default)',
                  labelStyle: const TextStyle(color: Colors.grey, fontSize: 12),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  filled: true,
                  fillColor: const Color(0xFF1a1a2e),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 10),
                ),
                items: _languages.map((lang) => DropdownMenuItem(value: lang['code'], child: Text(lang['name']!, overflow: TextOverflow.ellipsis))).toList(),
                onChanged: (value) => setState(() { _targetLanguage = value!; _targetSearchController.text = ''; _targetSearch = ''; }),
              ),
            ),
            const SizedBox(width: 10),
            IconButton(
              icon: const Icon(Icons.search, color: Colors.blue),
              onPressed: () => showDialog(
                context: context,
                builder: (context) => AlertDialog(
                  backgroundColor: const Color(0xFF1a1a2e),
                  title: const Text('Search Target Language', style: TextStyle(color: Colors.white)),
                  content: TextField(
                    autofocus: true,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(hintText: 'Type language...', hintStyle: TextStyle(color: Colors.grey)),
                    onChanged: (value) => setState(() => _targetSearch = value),
                  ),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel', style: TextStyle(color: Colors.grey))),
                  ],
                ),
              ),
            ),
          ]),
          if (_targetSearch.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 5),
              padding: const EdgeInsets.symmetric(horizontal: 10),
              decoration: BoxDecoration(color: const Color(0xFF1a1a2e), borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.blue.withOpacity(0.5))),
              child: Wrap(
                spacing: 8,
                children: _filterLanguages(_targetSearch).take(20).map((lang) => ChoiceChip(
                  label: Text(lang['name']!, style: const TextStyle(color: Colors.white, fontSize: 12)),
                  selected: _targetLanguage == lang['code'],
                  selectedColor: Colors.blue,
                  backgroundColor: Colors.transparent,
                  onSelected: (selected) {
                    setState(() { _targetLanguage = lang['code']!; _targetSearch = ''; });
                    Navigator.pop(context);
                  },
                )).toList(),
              ),
            ),
          const SizedBox(height: 20),
          TextField(controller: _textController, maxLines: 4, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(hintText: 'Enter text or tap the mic...', hintStyle: TextStyle(color: Colors.grey), border: OutlineInputBorder())),
          const SizedBox(height: 20),
          Row(children: [
            Expanded(child: ElevatedButton.icon(onPressed: _isRecording ? _stopRecording : _startRecording, icon: Icon(_isRecording ? Icons.stop : Icons.mic), label: Text(_isRecording ? 'Stop' : 'Speak'), style: ElevatedButton.styleFrom(backgroundColor: _isRecording ? Colors.red : Colors.orange, padding: const EdgeInsets.symmetric(vertical: 15)))),
            const SizedBox(width: 10),
            Expanded(child: ElevatedButton.icon(onPressed: _isLoading ? null : _translateText, icon: const Icon(Icons.translate), label: Text(_isLoading ? 'Working...' : 'Translate'), style: ElevatedButton.styleFrom(backgroundColor: Colors.blue, padding: const EdgeInsets.symmetric(vertical: 15)))),
          ]),
          if (_translatedText.isNotEmpty) ...[
            const SizedBox(height: 30),
            Card(color: const Color(0xFF1a1a2e), elevation: 4, child: Padding(padding: const EdgeInsets.all(16.0), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Translation:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.white)),
              const SizedBox(height: 10),
              Text(_translatedText, style: const TextStyle(fontSize: 20, color: Colors.white)),
              const SizedBox(height: 10),
              ElevatedButton.icon(onPressed: _speakTranslation, icon: const Icon(Icons.volume_up), label: const Text('Hear Translation'), style: ElevatedButton.styleFrom(backgroundColor: Colors.green)),
            ]))),
          ],
        ],
      ),
    );
  }

  Widget _buildHistoryTab() {
    return _history.isEmpty ? const Center(child: Text('No translations yet.', style: TextStyle(color: Colors.grey))) : ListView.builder(padding: const EdgeInsets.all(15.0), itemCount: _history.length, itemBuilder: (context, index) {
      final item = _history[index];
      return Card(color: const Color(0xFF1a1a2e), margin: const EdgeInsets.only(bottom: 10), child: ListTile(title: Text(item['source_text'] ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)), subtitle: Text(item['translated_text'] ?? '', style: const TextStyle(color: Colors.blue))));
    });
  }

  Widget _buildCallCenterTab() {
    return Padding(padding: const EdgeInsets.all(20.0), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('📞 Call Center', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white)),
      const SizedBox(height: 20),
      ElevatedButton.icon(onPressed: _simulateIncomingCall, icon: const Icon(Icons.call_received), label: const Text('Simulate Incoming Call'), style: ElevatedButton.styleFrom(backgroundColor: Colors.orange, padding: const EdgeInsets.symmetric(vertical: 15))),
      const SizedBox(height: 20),
      const Text('📋 Call Queue', style: TextStyle(fontSize: 18, color: Colors.white)),
      if (_callQueue.isEmpty) const Text('Queue empty', style: TextStyle(color: Colors.grey))
      else ..._callQueue.asMap().entries.map((entry) {
        return Card(color: const Color(0xFF1a1a2e), margin: const EdgeInsets.only(bottom: 8), child: ListTile(title: Text(entry.value['caller'] ?? '', style: const TextStyle(color: Colors.white)), subtitle: Text(entry.value['language'] ?? '', style: const TextStyle(color: Colors.grey)), trailing: ElevatedButton(onPressed: () => _acceptCall(entry.key), style: ElevatedButton.styleFrom(backgroundColor: Colors.green), child: const Text('Accept'))));
      }).toList(),
      if (_activeCall != null) ...[
        const SizedBox(height: 20),
        Text('💬 Active Call: $_activeCall', style: const TextStyle(color: Colors.white, fontSize: 18)),
        ..._transcript.map((line) => Card(color: const Color(0xFF1a1a2e), child: ListTile(title: Text('${line['speaker']}: ${line['text']}', style: const TextStyle(color: Colors.white)), subtitle: Text(line['language'] ?? '', style: const TextStyle(color: Colors.grey))))).toList(),
        ElevatedButton(onPressed: _endCall, style: ElevatedButton.styleFrom(backgroundColor: Colors.red), child: const Text('End Call')),
      ],
    ]));
  }

  Widget _buildPttTab() {
    return Column(children: [
      Expanded(child: Row(children: [
        Expanded(child: Container(color: _isSpeakerATurn ? Colors.blue.withOpacity(0.3) : Colors.transparent, child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Text('Speaker A', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          DropdownButton<String>(value: _speakerA, dropdownColor: const Color(0xFF1a1a2e), style: const TextStyle(color: Colors.white), items: _languages.map((lang) => DropdownMenuItem(value: lang['code'], child: Text(lang['name']!))).toList(), onChanged: (value) => setState(() => _speakerA = value!)),
        ]))),
        Expanded(child: Container(color: !_isSpeakerATurn ? Colors.green.withOpacity(0.3) : Colors.transparent, child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Text('Speaker B', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          DropdownButton<String>(value: _speakerB, dropdownColor: const Color(0xFF1a1a2e), style: const TextStyle(color: Colors.white), items: _languages.map((lang) => DropdownMenuItem(value: lang['code'], child: Text(lang['name']!))).toList(), onChanged: (value) => setState(() => _speakerB = value!)),
        ]))),
      ])),
      Container(padding: const EdgeInsets.all(20), child: Column(children: [
        if (_isListening) Container(height: 50, child: AudioWaveforms(size: const Size(double.infinity, 50), recorderController: _waveformController, waveStyle: const WaveStyle(waveColor: Colors.blue, extendWaveform: true))),
        GestureDetector(onLongPressStart: (_) => _startPtt(), onLongPressEnd: (_) => _stopPtt(), child: Container(width: 80, height: 80, decoration: BoxDecoration(shape: BoxShape.circle, color: _isListening ? Colors.red : Colors.blue), child: Icon(_isListening ? Icons.mic : Icons.mic_none, color: Colors.white, size: 40))),
        const SizedBox(height: 10),
        Text(_isListening ? '🎤 Listening...' : 'Hold to talk', style: const TextStyle(color: Colors.white)),
        const SizedBox(height: 10),
        ElevatedButton.icon(onPressed: _switchSpeaker, icon: const Icon(Icons.swap_horiz), label: const Text('Switch Speaker')),
      ])),
    ]);
  }

  Widget _buildVideoTab() {
    return Padding(padding: const EdgeInsets.all(20.0), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('🎬 Video Studio', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white)),
      const SizedBox(height: 20),
      Card(
        color: const Color(0xFF1a1a2e),
        child: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(children: [
            const Icon(Icons.video_library, size: 60, color: Colors.blue),
            const SizedBox(height: 10),
            const Text('Drag & Drop Video', style: TextStyle(color: Colors.white, fontSize: 18)),
            const SizedBox(height: 5),
            const Text('.mp4, .mov', style: TextStyle(color: Colors.grey)),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: () {
                setState(() {
                  _liveSubtitles = ['Good morning, welcome', 'Today we learn translation', 'Real-time subtitles', 'Thank you for watching'];
                });
              },
              icon: const Icon(Icons.subtitles),
              label: const Text('Show Demo Subtitles'),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.blue, padding: const EdgeInsets.symmetric(vertical: 15)),
            ),
            const SizedBox(height: 15),
            DropdownButtonFormField<String>(
              value: _subtitleLanguage,
              dropdownColor: const Color(0xFF1a1a2e),
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(labelText: 'Subtitle Language', labelStyle: TextStyle(color: Colors.grey), border: OutlineInputBorder()),
              items: _languages.map((lang) => DropdownMenuItem(value: lang['code'], child: Text(lang['name']!))).toList(),
              onChanged: (value) => setState(() => _subtitleLanguage = value!),
            ),
          ]),
        ),
      ),
      if (_liveSubtitles.isNotEmpty) ...[
        const SizedBox(height: 20),
        const Text('Live Subtitles:', style: TextStyle(fontSize: 18, color: Colors.white, fontWeight: FontWeight.bold)),
        const SizedBox(height: 10),
        ..._liveSubtitles.map((sub) => Card(color: Colors.black87, margin: const EdgeInsets.only(bottom: 6), child: ListTile(title: Text(sub, style: const TextStyle(color: Colors.white, fontSize: 16))))).toList(),
      ],
    ]));
  }

  Widget _buildAdminTab() {
    if (_adminDashboard == null) return const Center(child: Text('Loading...', style: TextStyle(color: Colors.grey)));
    return SingleChildScrollView(padding: const EdgeInsets.all(20.0), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('⚙️ Admin Dashboard', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white)),
      const SizedBox(height: 20),
      Card(color: const Color(0xFF1a1a2e), child: Padding(padding: const EdgeInsets.all(16.0), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Total Users: ${_adminDashboard!['total_users']}', style: const TextStyle(color: Colors.white, fontSize: 16)),
        Text('Premium: ${_adminDashboard!['premium_users']}', style: const TextStyle(color: Colors.white, fontSize: 16)),
        Text('Translations: ${_adminDashboard!['total_translations']}', style: const TextStyle(color: Colors.white, fontSize: 16)),
      ]))),
      ..._adminUsers.map((user) => ListTile(title: Text(user['username'] ?? '', style: const TextStyle(color: Colors.white)), subtitle: Text(user['email'] ?? '', style: const TextStyle(color: Colors.grey)))).toList(),
    ]));
  }
}