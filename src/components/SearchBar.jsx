import { useState } from "react";
import { MapPin, Search } from "lucide-react";
import { useBookings } from "../BookingContext";
import { validateTrip } from "../lib/booking";
import TripFields from "./TripFields";

export default function SearchBar() {
  const { search, setSearch } = useBookings();
  const [draft, setDraft] = useState(search);
  const [error, setError] = useState("");
  function submit(event) {
    event.preventDefault();
    const message = validateTrip(draft);
    setError(message);
    if (!message) setSearch(draft);
  }
  return (
    <section aria-label="Search stays" className="search-section">
      <form
        className="search-bar"
        onSubmit={submit}
        aria-describedby={error ? "search-error" : undefined}
      >
        <label className="trip-field destination">
          <MapPin size={21} />
          <span>
            <span className="field-label">Where</span>
            <input
              aria-label="Destination"
              type="search"
              placeholder="Anywhere in California"
              value={draft.destination}
              onChange={(event) =>
                setDraft({ ...draft, destination: event.target.value })
              }
            />
          </span>
        </label>
        <TripFields value={draft} onChange={setDraft} />
        <button className="button-primary search-button" type="submit">
          <Search size={19} />
          Search
        </button>
      </form>
      {error && (
        <p id="search-error" role="alert" className="text-error text-sm mt-3">
          {error}
        </p>
      )}
    </section>
  );
}
