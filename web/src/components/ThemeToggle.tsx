import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../ThemeProvider';

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle color mode">
      {isDark ? <Moon size={16} /> : <Sun size={16} />}
      <span>{isDark ? 'Dark' : 'Light'}</span>
    </button>
  );
};
