import { createContext, useContext, useEffect, useRef, useState } from "react";
import { defaultSearch, validateTrip } from "./lib/booking";
import { defaultFilters } from "./data/stays";
import { emptyData, loadData, loadTheme, saveData } from "./lib/storage";

const BookingContext = createContext(null);

function loadSearch() {
  try {
    const saved = JSON.parse(sessionStorage.getItem("blossom-search"));
    return saved &&
      typeof saved.destination === "string" &&
      !validateTrip(saved)
      ? saved
      : defaultSearch();
  } catch {
    return defaultSearch();
  }
}

export function BookingProvider({ children }) {
  const [data, setData] = useState(loadData);
  const dataRef = useRef(data);
  const [themePreference, setTheme] = useState(loadTheme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const theme = themePreference === "system" ? (systemDark ? "dark" : "light") : themePreference;
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [search, setSearch] = useState(loadSearch);
  const [filters, setFilters] = useState(defaultFilters);
  const [storageError, setStorageError] = useState(false);

  // Update the ref immediately so a repeated event cannot insert the same booking twice.
  function updateData(next) {
    dataRef.current = next;
    setData(next);
    setStorageError(!saveData(next));
  }

  function addBooking(booking) {
    if (dataRef.current.bookings.some((item) => item.id === booking.id)) return;
    updateData({
      ...dataRef.current,
      bookings: [booking, ...dataRef.current.bookings],
    });
  }

  function toggleFavorite(id) {
    const current = dataRef.current;
    const favorites = current.favorites.includes(id)
      ? current.favorites.filter((item) => item !== id)
      : [...current.favorites, id];
    updateData({ ...current, favorites });
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("blossom-theme", themePreference);
    } catch {
      /* Theme still works in memory. */
    }
  }, [theme, themePreference]);

  useEffect(() => {
    try {
      sessionStorage.setItem("blossom-search", JSON.stringify(search));
    } catch {
      /* Search still works in memory. */
    }
  }, [search]);

  return (
    <BookingContext.Provider
      value={{
        ...data,
        theme,
        themePreference,
        setTheme,
        search,
        setSearch,
        filters,
        setFilters,
        addBooking,
        toggleFavorite,
        resetDemo: () => updateData(emptyData()),
        storageError,
      }}
    >
      {children}
    </BookingContext.Provider>
  );
}

export const useBookings = () => useContext(BookingContext);
