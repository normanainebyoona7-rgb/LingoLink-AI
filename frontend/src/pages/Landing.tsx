import React, { useState, useEffect } from 'react';
import { useTheme } from '../App';

interface Props {
  onLoginClick: () => void;
  onRegisterClick: () => void;
}

export default function Landing({ onLoginClick, onRegisterClick }: Props) {
  const { darkMode, toggleDarkMode } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const features = [
    { icon: '🔄', title: 'Real-Time Translation', description: 'Auto-detects language and translates as you type with smart debouncing for instant results.' },
    { icon: '🎤', title: 'Hold-to-Speak', description: 'Hold the mic button, speak naturally in any language, and release for instant translation.' },
    { icon: '🎬', title: 'Video Subtitles', description: 'Upload videos and generate AI-powered subtitles in any of our 50+ supported languages.' },
    { icon: '📞', title: 'AI Call Center', description: 'AI auto-answers calls and responds in the caller\'s language with voice.' },
    { icon: '🌍', title: 'African Languages', description: 'Luganda, Acholi, Alur, Ateso, Swahili, Yoruba, and 30+ local African dialects.' },
    { icon: '🔒', title: 'Enterprise Security', description: 'Secure JWT authentication with encrypted data transmission for your peace of mind.' },
  ];

  const languages = [
    'English', 'Spanish', 'French', 'German', 'Swahili', 'Luganda',
    'Acholi', 'Alur', 'Ateso', 'Runyankole', 'Rukiga', 'Yoruba',
    'Hausa', 'Igbo', 'Zulu', 'Xhosa', 'Amharic', 'Somali',
    'Kinyarwanda', 'Kirundi',
  ];

  const testimonials = [
    { name: 'Sarah Nakato', role: 'Field Agent, Kampala', text: 'LingoLink AI transformed how we communicate with clients across Uganda. The Luganda translation is spot on!', avatar: '👩🏾' },
    { name: 'John Ochieng', role: 'Call Center Manager, Nairobi', text: 'The AI Call Center auto-answers and responds in Swahili. Our response time dropped by 80%.', avatar: '👨🏾' },
    { name: 'Grace Achieng', role: 'Translator, Gulu', text: 'The Acholi translation is incredibly accurate. This is the best tool for African languages.', avatar: '👩🏾' },
  ];

  const pricingPlans = [
    { name: 'Free', price: '$0', description: 'For individuals getting started', features: ['50 translations/day', '5 languages', 'Text translation', 'Community support'], highlighted: false },
    { name: 'Premium', price: '$29', description: 'For professionals and businesses', features: ['Unlimited translations', '50+ languages', 'Voice translation', 'Video subtitles', 'Priority support'], highlighted: true },
    { name: 'Enterprise', price: 'Custom', description: 'For large organizations', features: ['Everything in Premium', 'AI Call Center', 'API access', 'Dedicated support', 'Custom integration'], highlighted: false },
  ];

  const faqs = [
    { question: 'How accurate is the translation?', answer: 'Our AI uses multiple engines (NLLB-200, Gemini, Google) with smart fallback. For African languages, NLLB-200 provides state-of-the-art accuracy.' },
    { question: 'Which African languages are supported?', answer: 'We support 30+ African languages including Luganda, Acholi, Alur, Ateso, Runyankole, Rukiga, Swahili, Yoruba, Hausa, Igbo, Zulu, Xhosa, and many more.' },
    { question: 'Can I use it on my phone?', answer: 'Yes! Our platform is fully responsive and works on any device with a browser. We also have a mobile app for Android.' },
    { question: 'Is my data secure?', answer: 'Absolutely. We use JWT authentication, encrypted data transmission, and never share your data with third parties.' },
    { question: 'Do you offer API access?', answer: 'Yes, Enterprise plans include API access for custom integration with your existing systems.' },
  ];

  return (
    <div className={`landing-root ${darkMode ? 'landing-dark' : 'landing-light'}`}>
      {/* Navigation */}
      <nav className={`ln-nav ${scrolled ? 'ln-nav-scrolled' : ''}`}>
        <div className="ln-logo">
          <span className="ln-logo-icon">🌐</span>
          <span className="ln-logo-text">LingoLink AI</span>
        </div>
        
        <div className={`ln-links ${isMenuOpen ? 'ln-links-open' : ''}`}>
          <a href="#features" className="ln-link" onClick={() => setIsMenuOpen(false)}>Features</a>
          <a href="#languages" className="ln-link" onClick={() => setIsMenuOpen(false)}>Languages</a>
          <a href="#pricing" className="ln-link" onClick={() => setIsMenuOpen(false)}>Pricing</a>
          <a href="#testimonials" className="ln-link" onClick={() => setIsMenuOpen(false)}>Testimonials</a>
          <a href="#faq" className="ln-link" onClick={() => setIsMenuOpen(false)}>FAQ</a>
          <button className="ln-theme-toggle" onClick={toggleDarkMode} title="Toggle theme">
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button className="ln-login-btn" onClick={onLoginClick}>Sign In</button>
          <button className="ln-register-btn" onClick={onRegisterClick}>Get Started</button>
        </div>

        <button className="ln-hamburger" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          {isMenuOpen ? '✕' : '☰'}
        </button>
      </nav>

      {/* Hero Section */}
      <section className="ln-hero">
        <div className="ln-hero-content">
          <div className="ln-badge">🚀 Enterprise AI Translation Platform</div>
          <h1 className="ln-hero-title">
            Break Language Barriers<br />
            <span className="ln-gradient">Instantly & Accurately</span>
          </h1>
          <p className="ln-hero-sub">
            Translate text, voice, and video across 50+ languages with enterprise-grade AI precision.
            Built for businesses, call centers, and field agents across Africa and beyond.
          </p>
          <div className="ln-hero-btns">
            <button className="ln-btn-primary" onClick={onRegisterClick}>Start Free Trial</button>
            <button className="ln-btn-secondary" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>
              Explore Features
            </button>
          </div>
          <div className="ln-stats">
            <div className="ln-stat"><span className="ln-stat-num">50+</span><span className="ln-stat-label">Languages</span></div>
            <div className="ln-stat-div"></div>
            <div className="ln-stat"><span className="ln-stat-num">3</span><span className="ln-stat-label">AI Engines</span></div>
            <div className="ln-stat-div"></div>
            <div className="ln-stat"><span className="ln-stat-num">99.9%</span><span className="ln-stat-label">Uptime</span></div>
            <div className="ln-stat-div"></div>
            <div className="ln-stat"><span className="ln-stat-num">∞</span><span className="ln-stat-label">Translations</span></div>
          </div>
        </div>
        <div className="ln-hero-visual">
          <div className="ln-platform-card">
            <div className="ln-platform-icon">🌐</div>
            <h3>Enterprise Translation Platform</h3>
            <p>Real-time AI-powered translation for businesses, call centers, and field agents.</p>
            <div className="ln-platform-features">
              <span className="ln-pf-item">✓ Text Translation</span>
              <span className="ln-pf-item">✓ Voice Translation</span>
              <span className="ln-pf-item">✓ Video Subtitles</span>
              <span className="ln-pf-item">✓ AI Call Center</span>
              <span className="ln-pf-item">✓ 50+ Languages</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="ln-features">
        <h2 className="ln-section-title">Powerful Features</h2>
        <p className="ln-section-sub">Everything you need for seamless AI-powered translation</p>
        <div className="ln-features-grid">
          {features.map((feature, index) => (
            <div key={index} className="ln-feature" style={{ animationDelay: `${index * 0.1}s` }}>
              <span className="ln-feature-icon">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Languages */}
      <section id="languages" className="ln-languages">
        <h2 className="ln-section-title">Supported Languages</h2>
        <p className="ln-section-sub">From international languages to local African dialects</p>
        <div className="ln-lang-cloud">
          {languages.map((lang) => (
            <span key={lang} className="ln-lang-chip">{lang}</span>
          ))}
        </div>
        <p className="ln-lang-more">+ 30 more languages supported including Runyankole, Lusoga, Ateso, and more</p>
      </section>

      {/* Pricing */}
      <section id="pricing" className="ln-pricing">
        <h2 className="ln-section-title">Pricing Plans</h2>
        <p className="ln-section-sub">Choose the plan that fits your needs</p>
        <div className="ln-pricing-grid">
          {pricingPlans.map((plan, index) => (
            <div key={index} className={`ln-pricing-card ${plan.highlighted ? 'ln-pricing-highlighted' : ''}`}>
              {plan.highlighted && <span className="ln-pricing-badge">MOST POPULAR</span>}
              <h3>{plan.name}</h3>
              <p className="ln-pricing-price">{plan.price}</p>
              <p className="ln-pricing-desc">{plan.description}</p>
              <ul className="ln-pricing-features">
                {plan.features.map((feature, i) => (
                  <li key={i}>✓ {feature}</li>
                ))}
              </ul>
              <button className={plan.highlighted ? 'ln-btn-primary' : 'ln-btn-secondary'} onClick={onRegisterClick}>
                {plan.highlighted ? 'Start Free Trial' : 'Get Started'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="ln-testimonials">
        <h2 className="ln-section-title">What Our Users Say</h2>
        <p className="ln-section-sub">Trusted by teams across Africa</p>
        <div className="ln-testimonials-grid">
          {testimonials.map((testimonial, index) => (
            <div key={index} className="ln-testimonial-card">
              <div className="ln-testimonial-avatar">{testimonial.avatar}</div>
              <p className="ln-testimonial-text">"{testimonial.text}"</p>
              <div className="ln-testimonial-author">
                <p className="ln-testimonial-name">{testimonial.name}</p>
                <p className="ln-testimonial-role">{testimonial.role}</p>
              </div>
              <div className="ln-testimonial-stars">★★★★★</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="ln-faq">
        <h2 className="ln-section-title">Frequently Asked Questions</h2>
        <p className="ln-section-sub">Everything you need to know</p>
        <div className="ln-faq-list">
          {faqs.map((faq, index) => (
            <div key={index} className="ln-faq-item">
              <button className="ln-faq-question" onClick={() => setActiveFaq(activeFaq === index ? null : index)}>
                <span>{faq.question}</span>
                <span className="ln-faq-icon">{activeFaq === index ? '−' : '+'}</span>
              </button>
              {activeFaq === index && (
                <div className="ln-faq-answer">
                  <p>{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="ln-cta">
        <h2>Ready to Break Language Barriers?</h2>
        <p>Join thousands of users translating with AI precision every single day.</p>
        <button className="ln-btn-primary" onClick={onRegisterClick}>Start Translating Now</button>
      </section>

      {/* Footer */}
      <footer className="ln-footer">
        <div className="ln-footer-content">
          <div className="ln-footer-brand">
            <span>🌐</span>
            <span>LingoLink AI</span>
          </div>
          <div className="ln-footer-links">
            <a href="#features">Features</a>
            <a href="#languages">Languages</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
        </div>
        <p>© 2026 LingoLink AI — Enterprise AI Translation Platform. All rights reserved.</p>
      </footer>
    </div>
  );
}