import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../App';

export const LANGUAGES: Record<string, string> = {
  english: 'English', spanish: 'Spanish', french: 'French', german: 'German',
  portuguese: 'Portuguese', italian: 'Italian', dutch: 'Dutch', russian: 'Russian',
  arabic: 'Arabic', hindi: 'Hindi', chinese: 'Chinese', japanese: 'Japanese',
  korean: 'Korean', turkish: 'Turkish',
  luganda: 'Luganda', rukiga: 'Rukiga', runyankole: 'Runyankole',
  acholi: 'Acholi', alur: 'Alur', ateso: 'Ateso', lango: 'Lango',
  lugbara: 'Lugbara', lusoga: 'Lusoga', lugwere: 'Lugwere',
  swahili: 'Swahili', kinyarwanda: 'Kinyarwanda', kirundi: 'Kirundi',
  amharic: 'Amharic', somali: 'Somali', oromo: 'Oromo', tigrinya: 'Tigrinya',
  kikuyu: 'Kikuyu', dholuo: 'Dholuo',
  yoruba: 'Yoruba', hausa: 'Hausa', igbo: 'Igbo', fulfulde: 'Fulfulde',
  wolof: 'Wolof', bambara: 'Bambara', twi: 'Twi', ewe: 'Ewe',
  lingala: 'Lingala', kikongo: 'Kikongo', bemba: 'Bemba', chichewa: 'Chichewa',
  zulu: 'Zulu', xhosa: 'Xhosa', afrikaans: 'Afrikaans', sesotho: 'Sesotho',
  setswana: 'Setswana', shona: 'Shona',
  kabyle: 'Kabyle', tachelhit: 'Tachelhit',
};

interface Props {
  value: string;
  onChange: (code: string) => void;
  placeholder: string;
  includeAutoDetect?: boolean;
}

export default function SearchableDropdown({ value, onChange, placeholder, includeAutoDetect = false }: Props) {
  const { darkMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus search input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build filtered options
  const allOptions = includeAutoDetect
    ? [{ code: 'auto', name: 'Auto Detect' }, ...Object.entries(LANGUAGES).map(([code, name]) => ({ code, name }))]
    : Object.entries(LANGUAGES).map(([code, name]) => ({ code, name }));

  const filtered = allOptions.filter(({ code, name }) =>
    name.toLowerCase().includes(search.toLowerCase()) ||
    code.toLowerCase().includes(search.toLowerCase())
  );

  // Reset highlight when search changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [search]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && optionsRef.current) {
      const el = optionsRef.current.children[highlightedIndex] as HTMLElement;
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const selectOption = (code: string) => {
    onChange(code);
    setIsOpen(false);
    setSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (filtered[highlightedIndex]) {
        selectOption(filtered[highlightedIndex].code);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearch('');
    } else if (e.key === 'Tab') {
      setIsOpen(false);
      setSearch('');
    }
  };

  const displayName = value === 'auto' ? 'Auto Detect' : (LANGUAGES[value] || value);

  return (
    <div className="lang-select" ref={ref}>
      <button
        type="button"
        className={`lang-select-btn ${isOpen ? 'active' : ''} ${darkMode ? 'dark' : 'light'}`}
        onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
      >
        <span className="lang-select-value">
          {value === 'auto' ? '🔍' : '🌐'} {displayName}
        </span>
        <svg className={`lang-select-arrow ${isOpen ? 'up' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className={`lang-select-menu ${darkMode ? 'dark' : 'light'}`}>
          <div className="lang-select-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              placeholder={`Search ${placeholder}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className={darkMode ? 'dark' : 'light'}
            />
            {search && (
              <button
                type="button"
                className="lang-select-clear"
                onClick={() => setSearch('')}
                tabIndex={-1}
              >
                ×
              </button>
            )}
          </div>
          <div className="lang-select-options" ref={optionsRef}>
            {filtered.map(({ code, name }, idx) => (
              <div
                key={code}
                className={`lang-select-option ${value === code ? 'selected' : ''} ${highlightedIndex === idx ? 'highlighted' : ''}`}
                onClick={() => selectOption(code)}
                onMouseEnter={() => setHighlightedIndex(idx)}
              >
                <span>{code === 'auto' ? '🔍 Auto Detect' : name}</span>
                {code !== 'auto' && <span className="lang-select-code">{code}</span>}
                {value === code && <span className="lang-select-check">✓</span>}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="lang-select-empty">No results for "{search}"</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}