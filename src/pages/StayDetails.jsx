import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Star,
  Users,
  BedDouble,
  Bath,
  Check,
  Home,
  KeyRound,
} from "lucide-react";
import { findStay } from "../data/stays";
import { useBookings } from "../BookingContext";
import { money, validateTrip } from "../lib/booking";
import TripFields from "../components/TripFields";
import PriceSummary from "../components/PriceSummary";
import EmptyState from "../components/EmptyState";
import { FavoriteButton } from "../components/StayCard";

export default function StayDetails() {
  const { id } = useParams();
  const stay = findStay(id);
  return stay ? (
    <StayContent key={id} stay={stay} />
  ) : (
    <EmptyState title="We couldn’t find that stay" />
  );
}

function StayContent({ stay }) {
  const { search, setSearch } = useBookings();
  const [trip, setTrip] = useState(search);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  function reserve(event) {
    event.preventDefault();
    const message = validateTrip(trip, stay.capacity);
    setError(message);
    if (!message) {
      setSearch(search);
      navigate(`/checkout/${stay.id}`);
    }
  }
  return (
    <div className="py-8">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} />
        All stays
      </Link>
      <div className="flex items-start justify-between gap-4 mt-6 mb-5">
        <div>
          <p className="eyebrow">{stay.tag}</p>
          <h1 className="page-title">{stay.name}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm mt-3">
            <span className="flex items-center gap-1.5">
              <Star size={14} fill="currentColor" />
              {stay.rating.toFixed(2)}
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <MapPin size={15} />
              {stay.city}, {stay.state}
            </span>
          </div>
        </div>
        <FavoriteButton stay={stay} className="border border-line mt-5" />
      </div>
      <img
        className="detail-hero"
        src={stay.image}
        alt={`${stay.name} in ${stay.city}`}
      />
      <div className="detail-layout">
        <section>
          <p className="eyebrow">
            {stay.type === "Home"
              ? "An entire place to call your own"
              : "Your own boutique hotel room"}
          </p>
          <h2 className="text-2xl font-semibold mt-2">{stay.highlight}</h2>
          <div className="flex flex-wrap gap-5 text-sm text-muted mt-5">
            <span className="flex gap-2 items-center">
              <Users size={17} />
              {stay.capacity} guests
            </span>
            <span className="flex gap-2 items-center">
              <BedDouble size={17} />
              {stay.bedrooms} {stay.bedrooms === 1 ? "bedroom" : "bedrooms"} ·{" "}
              {stay.beds} {stay.beds === 1 ? "bed" : "beds"}
            </span>
            <span className="flex gap-2 items-center">
              <Bath size={17} />
              {stay.baths} {stay.baths === 1 ? "bath" : "baths"}
            </span>
          </div>
          <p className="text-muted leading-7 border-y border-line py-7 my-7">
            {stay.description}
          </p>
          <h2 className="text-xl font-semibold">Make yourself at home</h2>
          <div className="grid sm:grid-cols-2 gap-4 mt-5">
            {stay.amenities.map((item) => (
              <span className="flex items-center gap-3 text-sm" key={item}>
                <Check size={17} className="text-brand" />
                {item}
              </span>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-6 border-t border-line mt-8 pt-7">
            <div className="flex gap-3">
              <Home size={22} className="text-brand shrink-0" />
              <div>
                <h3 className="font-semibold text-sm">A space for your stay</h3>
                <p className="text-sm text-muted mt-1">
                  {stay.type === "Home"
                    ? "The whole home, just for your group."
                    : "One private room, just for your group."}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <KeyRound size={22} className="text-brand shrink-0" />
              <div>
                <h3 className="font-semibold text-sm">Easy to try</h3>
                <p className="text-sm text-muted mt-1">
                  Every future date is available in this demo.
                </p>
              </div>
            </div>
          </div>
        </section>
        <aside>
          <form className="booking-panel" onSubmit={reserve}>
            <p>
              <strong className="text-2xl">{money(stay.price)}</strong>
              <span className="text-muted text-sm"> / night</span>
            </p>
            <div className="booking-fields mt-6">
              <TripFields
                value={trip}
                onChange={setTrip}
                capacity={stay.capacity}
              />
            </div>
            {error && (
              <p role="alert" className="text-error text-sm mt-3">
                {error}
              </p>
            )}
            <div className="mt-6">
              <PriceSummary stay={stay} trip={trip} />
            </div>
            <button
              className="button-primary w-full mt-6 justify-center"
              type="submit"
            >
              Reserve this stay
              <ArrowRight size={17} />
            </button>
            <p className="text-xs text-muted text-center mt-3">
              You won’t be charged. This is a demo booking.
            </p>
          </form>
        </aside>
      </div>
    </div>
  );
}
