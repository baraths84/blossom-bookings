const DAY = 86_400_000;

// Date inputs represent calendar days, not instants. UTC avoids DST rounding bugs.
export function dayNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== value
  )
    return NaN;
  return time / DAY;
}

export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function addDays(date, amount) {
  return new Date((dayNumber(date) + amount) * DAY).toISOString().slice(0, 10);
}

export function defaultSearch() {
  const checkIn = addDays(todayISO(), 7);
  return {
    destination: "California",
    checkIn,
    checkOut: addDays(checkIn, 3),
    guests: 2,
  };
}

export function nightsBetween(checkIn, checkOut) {
  return dayNumber(checkOut) - dayNumber(checkIn);
}

export function validateTrip(trip, capacity = 8, today = todayISO()) {
  if (
    !Number.isFinite(dayNumber(trip.checkIn)) ||
    !Number.isFinite(dayNumber(trip.checkOut))
  )
    return "Choose valid check-in and check-out dates.";
  if (trip.checkIn <= today) return "Check-in must be after today.";
  if (nightsBetween(trip.checkIn, trip.checkOut) <= 0)
    return "Check-out must be after check-in.";
  if (!Number.isInteger(Number(trip.guests)) || Number(trip.guests) < 1)
    return "Choose at least one guest.";
  if (Number(trip.guests) > capacity)
    return `This stay accommodates up to ${capacity} guests.`;
  return "";
}

export function tripPrice(stay, trip) {
  const nights = nightsBetween(trip.checkIn, trip.checkOut);
  return {
    nights,
    total: Number.isFinite(nights) && nights > 0 ? nights * stay.price : 0,
  };
}

export const money = (amount) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
export const formatDate = (date) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

export function filterStays(stays, search, filters) {
  const destination = search.destination.trim().toLowerCase();
  return stays.filter(
    (stay) =>
      `${stay.name} ${stay.city} ${stay.state}`
        .toLowerCase()
        .includes(destination) &&
      stay.capacity >= Number(search.guests) &&
      (filters.type === "All stays" ||
        stay.type === (filters.type === "Homes" ? "Home" : "Hotel")) &&
      (filters.minPrice === "" || stay.price >= Number(filters.minPrice)) &&
      (filters.maxPrice === "" || stay.price <= Number(filters.maxPrice)) &&
      filters.amenities.every((amenity) => stay.amenities.includes(amenity)),
  );
}

export function createBooking(stay, trip, guest, id = crypto.randomUUID()) {
  const error = validateTrip(trip, stay.capacity);
  if (error) throw new Error(error);
  if (!guest.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email))
    throw new Error("Enter a guest name and valid email address.");
  return {
    id,
    reference: `BB-${id.slice(0, 8).toUpperCase()}`,
    listingId: stay.id,
    checkIn: trip.checkIn,
    checkOut: trip.checkOut,
    guests: Number(trip.guests),
    guest: { name: guest.name.trim(), email: guest.email.trim() },
    total: tripPrice(stay, trip).total,
    createdAt: new Date().toISOString(),
  };
}
