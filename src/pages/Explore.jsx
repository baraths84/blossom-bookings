import { Heart, ArrowUpRight, Sparkles } from "lucide-react";
import { useBookings } from "../BookingContext";
import { stays, defaultFilters } from "../data/stays";
import { defaultSearch, filterStays, nightsBetween } from "../lib/booking";
import SearchBar from "../components/SearchBar";
import Filters from "../components/Filters";
import StayCard from "../components/StayCard";
import EmptyState from "../components/EmptyState";

export default function Explore({ saved = false }) {
  const { search, setSearch, filters, setFilters, favorites } = useBookings();
  const results = saved
    ? stays.filter((stay) => favorites.includes(stay.id))
    : filterStays(stays, search, filters);
  function clearSearch() {
    setFilters(defaultFilters);
    setSearch(defaultSearch());
  }
  return (
    <>
      {!saved && <SearchBar key={JSON.stringify(search)} />}
      <section className={saved ? "pt-10" : ""}>
        {!saved && <Filters />}
        <div className="flex items-end justify-between gap-5 mb-7">
          <div>
            <p className="eyebrow">
              {saved
                ? "A little collection of possibilities"
                : "A change of scenery starts here"}
            </p>
            <h1 className="page-title">
              {saved ? "Your saved stays" : "Stays for your next escape"}
              {saved && <Heart className="inline ml-3 text-brand" size={27} />}
            </h1>
            <p className="text-muted text-sm mt-2.5">
              {saved
                ? `${results.length} ${results.length === 1 ? "place" : "places"} worth coming back to`
                : `${search.destination || "All destinations"} · ${nightsBetween(search.checkIn, search.checkOut)} nights · ${search.guests} ${Number(search.guests) === 1 ? "guest" : "guests"}`}
            </p>
          </div>
          {!saved && (
            <span
              className="text-xs text-muted shrink-0 mb-1 hidden sm:block"
              aria-live="polite"
            >
              {results.length} thoughtfully chosen stays
            </span>
          )}
        </div>
        {results.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-7">
            {results.map((stay) => (
              <StayCard key={stay.id} stay={stay} />
            ))}
          </div>
        ) : (
          <EmptyState
            heading="h2"
            title={
              saved ? "Keep your favorites close" : "No stays found just yet"
            }
            message={
              saved
                ? "Tap the heart on any stay to save it here for later."
                : "Try another destination, fewer guests, or a wider price range."
            }
          >
            {!saved && (
              <button className="button-primary" onClick={clearSearch}>
                Clear search and filters
              </button>
            )}
          </EmptyState>
        )}
      </section>
      {!saved && results.length > 0 && (
        <div className="discovery-note">
          <div className="flex items-center gap-4">
            <span className="note-icon">
              <Sparkles size={22} />
            </span>
            <div>
              <p className="font-semibold text-sm">
                Somewhere new. Something wonderful.
              </p>
              <p className="text-sm text-muted mt-1">
                From coastal mornings to cabin evenings, find a stay that feels
                like you.
              </p>
            </div>
          </div>
          <ArrowUpRight size={23} className="text-brand hidden sm:block" />
        </div>
      )}
    </>
  );
}
