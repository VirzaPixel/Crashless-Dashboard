import { Moon, Sun } from 'lucide-react';
import { useTheme } from './theme';
import './ThemeToggle.css';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === 'light' ? 'gelap' : 'terang';

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={`Aktifkan mode ${nextTheme}`}
      title={`Aktifkan mode ${nextTheme}`}
    >
      {theme === 'light' ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
      <span>{theme === 'light' ? 'Mode gelap' : 'Mode terang'}</span>
    </button>
  );
}
