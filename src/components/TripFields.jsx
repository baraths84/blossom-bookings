import { CalendarDays, Users } from "lucide-react";
import { addDays, todayISO } from "../lib/booking";

export default function TripFields({ value, onChange, capacity = 8 }) {
  const update = (field, next) => onChange({ ...value, [field]: next });
  return (
    <>
      <label className="trip-field">
        <CalendarDays size={20} />
        <span>
          <span className="field-label">Check in</span>
          <input
            type="date"
            aria-label="Check in"
            value={value.checkIn}
            min={addDays(todayISO(), 1)}
            max="9999-12-30"
            required
            onInput={(event) => update("checkIn", event.currentTarget.value)}
            onChange={(event) => update("checkIn", event.target.value)}
          />
        </span>
      </label>
      <label className="trip-field">
        <CalendarDays size={20} />
        <span>
          <span className="field-label">Check out</span>
          <input
            type="date"
            aria-label="Check out"
            value={value.checkOut}
            min={value.checkIn || addDays(todayISO(), 2)}
            max="9999-12-31"
            required
            onInput={(event) => update("checkOut", event.currentTarget.value)}
            onChange={(event) => update("checkOut", event.target.value)}
          />
        </span>
      </label>
      <label className="trip-field">
        <Users size={20} />
        <span>
          <span className="field-label">Guests</span>
          <select
            aria-label="Guests"
            value={value.guests}
            onChange={(event) => update("guests", Number(event.target.value))}
          >
            {Array.from(
              { length: Math.max(capacity, Number(value.guests) || 1) },
              (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1} {i === 0 ? "guest" : "guests"}
                </option>
              ),
            )}
          </select>
        </span>
      </label>
    </>
  );
}
