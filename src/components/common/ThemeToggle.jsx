import { Moon, Sun } from 'lucide-react';
import { useTheme } from './theme';
import { useLanguage } from './language';
import './ThemeToggle.css';

export function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const label = theme === 'light' ? t('toggleThemeDark') : t('toggleThemeLight');

  return (
    <button
      className={`header-icon-btn ${className}`}
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {theme === 'light' ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
    </button>
  );
}

export function LanguageToggle({ className = '' }) {
  const { lang, toggleLang, t } = useLanguage();
  const label = t('switchLang');

  return (
    <button
      className={`header-icon-btn lang-toggle ${className}`}
      type="button"
      onClick={toggleLang}
      aria-label={label}
      title={label}
    >
      <span className="lang-code">{lang.toUpperCase()}</span>
    </button>
  );
}
