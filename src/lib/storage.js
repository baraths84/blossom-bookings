import { findStay } from "../data/stays";
import { dayNumber, nightsBetween } from "./booking";

export const STORAGE_KEY = "blossom-bookings-v1";
export const emptyData = () => ({ favorites: [], bookings: [] });

function validBooking(booking) {
  const stay = findStay(booking?.listingId);
  return (
    stay &&
    typeof booking.id === "string" &&
    typeof booking.reference === "string" &&
    Number.isFinite(dayNumber(booking.checkIn)) &&
    nightsBetween(booking.checkIn, booking.checkOut) > 0 &&
    Number.isInteger(booking.guests) &&
    booking.guests > 0 &&
    booking.guests <= stay.capacity &&
    Number.isFinite(booking.total) &&
    booking.total >= 0 &&
    typeof booking.guest?.name === "string" &&
    typeof booking.guest?.email === "string"
  );
}

export function loadData(storage = localStorage) {
  try {
    const data = JSON.parse(storage.getItem(STORAGE_KEY));
    return {
      favorites: Array.isArray(data?.favorites)
        ? [...new Set(data.favorites.filter((id) => findStay(id)))]
        : [],
      bookings: Array.isArray(data?.bookings)
        ? data.bookings.filter(validBooking)
        : [],
    };
  } catch {
    return emptyData();
  }
}

export function saveData(data, storage = localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadTheme() {
  try {
    const preference = localStorage.getItem("blossom-theme");
    return ["light", "dark", "system"].includes(preference) ? preference : "system";
  } catch {
    return "system";
  }
}
