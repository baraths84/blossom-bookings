import { Sun, Moon, Monitor } from "lucide-react";
import { useBookings } from "../BookingContext";

export default function ThemeSelector() {
  const { themePreference, setTheme } = useBookings();
  return <div className="theme-toggle theme-selector" role="group" aria-label="Color theme">
    <button type="button" title="Light" aria-label="Switch to light mode" aria-pressed={themePreference === 'light'} onClick={() => setTheme('light')}><Sun size={17} /></button>
    <button type="button" title="Dark" aria-label="Switch to dark mode" aria-pressed={themePreference === 'dark'} onClick={() => setTheme('dark')}><Moon size={17} /></button>
    <button type="button" title="System" aria-label="Use system theme" aria-pressed={themePreference === 'system'} onClick={() => setTheme('system')}><Monitor size={17} /></button>
  </div>;
}
