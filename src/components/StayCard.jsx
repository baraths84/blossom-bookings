import { Link } from "react-router-dom";
import { Heart, Star } from "lucide-react";
import { useBookings } from "../BookingContext";
import { money, tripPrice } from "../lib/booking";

export function FavoriteButton({ stay, className = "" }) {
  const { favorites, toggleFavorite } = useBookings();
  const saved = favorites.includes(stay.id);
  return (
    <button
      className={`favorite-button ${saved ? "saved" : ""} ${className}`}
      aria-label={`${saved ? "Unsave" : "Save"} ${stay.name}`}
      aria-pressed={saved}
      onClick={() => toggleFavorite(stay.id)}
    >
      <Heart size={19} fill={saved ? "currentColor" : "none"} />
    </button>
  );
}

export default function StayCard({ stay }) {
  const { search } = useBookings();
  const { nights, total } = tripPrice(stay, search);
  return (
    <article className="stay-card">
      <div className="relative">
        <Link
          to={`/stays/${stay.id}`}
          className="photo-link"
          aria-label={`View ${stay.name}`}
        >
          <img
            src={stay.image}
            alt={`${stay.name} in ${stay.city}`}
            loading="lazy"
            className="stay-photo"
          />
        </Link>
        <span className="photo-badge">{stay.tag}</span>
        <FavoriteButton stay={stay} className="absolute right-3 top-3" />
      </div>
      <div className="mt-3.5">
        <div className="flex justify-between items-start gap-2">
          <h2 className="font-semibold text-[15px]">
            <Link className="hover:underline" to={`/stays/${stay.id}`}>
              {stay.name}
            </Link>
          </h2>
          <span className="rating">
            <Star size={12} fill="currentColor" />
            {stay.rating.toFixed(2)}
          </span>
        </div>
        <p className="text-sm text-muted mt-1">
          {stay.city}, {stay.state}
        </p>
        <p className="text-xs text-muted mt-1">
          {stay.type === "Home" ? "Entire home" : "Hotel room"}{" "}
          <span className="mx-1">·</span> {stay.capacity} guests
        </p>
        <p className="text-sm mt-3">
          <span className="font-semibold text-base">{money(stay.price)}</span>{" "}
          <span className="text-muted">/ night</span>
        </p>
        <p className="text-xs text-muted mt-0.5">
          {money(total)} for {nights} nights
        </p>
      </div>
    </article>
  );
}
