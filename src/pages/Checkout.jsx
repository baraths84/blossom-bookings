import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CreditCard, Check, ShieldCheck, Star } from "lucide-react";
import { findStay } from "../data/stays";
import { useBookings } from "../BookingContext";
import { createBooking, validateTrip } from "../lib/booking";
import TripFields from "../components/TripFields";
import PriceSummary from "../components/PriceSummary";
import EmptyState from "../components/EmptyState";

export default function Checkout() {
  const { id } = useParams();
  const stay = findStay(id);
  return stay ? (
    <CheckoutContent key={id} stay={stay} />
  ) : (
    <EmptyState title="We couldn’t find that stay" />
  );
}

function CheckoutContent({ stay }) {
  const { search, setSearch, addBooking } = useBookings();
  const [trip, setTrip] = useState(search);
  const [guest, setGuest] = useState({
    name: "Alex Morgan",
    email: "alex@example.com",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitted = useRef(false);
  const bookingId = useRef(crypto.randomUUID());
  const navigate = useNavigate();
  function confirm(event) {
    event.preventDefault();
    if (submitted.current) return;
    const tripError = validateTrip(trip, stay.capacity);
    if (tripError) {
      setError(tripError);
      return;
    }
    try {
      const booking = createBooking(stay, trip, guest, bookingId.current);
      submitted.current = true;
      setSubmitting(true);
      addBooking(booking);
      setSearch(trip);
      navigate(`/confirmation/${booking.id}`, { replace: true });
    } catch (issue) {
      submitted.current = false;
      setSubmitting(false);
      setError(issue.message);
    }
  }
  return (
    <div className="checkout-page py-8 mx-auto">
      <Link className="back-link" to={`/stays/${stay.id}`}>
        <ArrowLeft size={16} />
        Back to your stay
      </Link>
      <p className="eyebrow mt-8">Just a little closer to your next escape</p>
      <h1 className="page-title">Make it a stay.</h1>
      <p className="text-muted mt-3 text-sm">
        A few details, and you’re all set.
      </p>
      <form onSubmit={confirm} className="checkout-layout">
        <div>
          <section className="checkout-section">
            <h2 className="section-title">
              <span className="step-number">1</span>Your trip
            </h2>
            <div className="checkout-fields">
              <TripFields
                value={trip}
                onChange={setTrip}
                capacity={stay.capacity}
              />
            </div>
          </section>
          <section className="checkout-section">
            <h2 className="section-title">
              <span className="step-number">2</span>Who’s checking in?
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="form-label">
                Full name
                <input
                  required
                  maxLength={100}
                  autoComplete="off"
                  value={guest.name}
                  onChange={(event) =>
                    setGuest({ ...guest, name: event.target.value })
                  }
                />
              </label>
              <label className="form-label">
                Email address
                <input
                  required
                  maxLength={200}
                  type="email"
                  autoComplete="off"
                  value={guest.email}
                  onChange={(event) =>
                    setGuest({ ...guest, email: event.target.value })
                  }
                />
              </label>
            </div>
            <p className="text-xs text-muted mt-3">
              Fictional details are prefilled. No email will be sent.
            </p>
          </section>
          <section className="checkout-section border-0">
            <h2 className="section-title">
              <span className="step-number">3</span>Payment
            </h2>
            <div className="payment-method">
              <CreditCard size={27} className="text-brand" />
              <div className="flex-1">
                <p className="font-semibold text-sm">Demo Visa ending 4242</p>
                <p className="text-xs text-muted mt-1">
                  Preconfigured for your demo stay
                </p>
              </div>
              <span className="selected-check">
                <Check size={14} />
              </span>
            </div>
            <div className="demo-notice">
              <ShieldCheck size={21} className="shrink-0" />
              <p>
                <strong>This one’s just for practice.</strong>
                <br />
                Payment is simulated. No money is charged and no real
                reservation is made.
              </p>
            </div>
          </section>
        </div>
        <aside>
          <div className="booking-panel">
            <img src={stay.image} alt={stay.name} className="checkout-image" />
            <div className="flex items-start justify-between gap-3 mt-4">
              <div>
                <h2 className="font-semibold">{stay.name}</h2>
                <p className="text-sm text-muted mt-1">
                  {stay.city}, {stay.state}
                </p>
                <p className="text-xs text-muted mt-1">
                  {stay.type === "Home" ? "Entire home" : "Hotel room"}
                </p>
              </div>
              <span className="rating">
                <Star size={12} fill="currentColor" />
                {stay.rating.toFixed(2)}
              </span>
            </div>
            <h3 className="font-semibold mt-6 mb-5">Your price summary</h3>
            <PriceSummary stay={stay} trip={trip} />
            {error && (
              <p role="alert" className="text-error text-sm mt-4">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="button-primary w-full justify-center mt-6"
            >
              {submitting ? "Confirming…" : "Confirm demo booking"}
            </button>
            <p className="text-xs text-muted text-center leading-5 mt-3">
              Saved in this browser. No real payment.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
