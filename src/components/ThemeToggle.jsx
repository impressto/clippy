import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSun, faMoon } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '../theme/ThemeContext';

export default function ThemeToggle({ className = 'theme-toggle' }) {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      className={className}
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      type="button"
    >
      <FontAwesomeIcon icon={isDark ? faSun : faMoon} />
    </button>
  );
}
