import { Link, useParams } from "react-router-dom";
import { ArrowRight, Check, CalendarDays, Users } from "lucide-react";
import { useBookings } from "../BookingContext";
import { findStay } from "../data/stays";
import { formatDate, money } from "../lib/booking";
import EmptyState from "../components/EmptyState";

export function Confirmation() {
  const { id } = useParams();
  const { bookings } = useBookings();
  const booking = bookings.find((item) => item.id === id);
  const stay = findStay(booking?.listingId);
  if (!booking || !stay)
    return (
      <EmptyState
        title="This booking isn’t here"
        message="Demo bookings live in the browser where you made them. This one may have been reset, or created in another browser."
      />
    );
  return (
    <div className="confirmation-page">
      <span className="success-icon">
        <Check size={30} />
      </span>
      <p className="eyebrow mt-6">A new escape, on the horizon</p>
      <h1 className="page-title mt-2">
        You’re all set, {booking.guest.name.split(" ")[0]}.
      </h1>
      <p className="text-muted mt-3">
        Your demo stay is confirmed. Let the daydreaming begin.
      </p>
      <div className="confirmation-card">
        <img src={stay.image} alt={stay.name} />
        <div className="p-6 text-left">
          <div className="flex justify-between gap-3">
            <h2 className="text-xl font-semibold">{stay.name}</h2>
            <span className="confirmed-badge">Confirmed</span>
          </div>
          <p className="text-sm text-muted mt-1">
            {stay.city}, {stay.state}
          </p>
          <div className="grid sm:grid-cols-2 gap-5 border-y border-line my-6 py-5">
            <div>
              <p className="field-label">Your dates</p>
              <p className="text-sm mt-1">
                {formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}
              </p>
            </div>
            <div>
              <p className="field-label">Guests</p>
              <p className="text-sm mt-1">
                {booking.guests} {booking.guests === 1 ? "guest" : "guests"}
              </p>
            </div>
            <div>
              <p className="field-label">Booking reference</p>
              <p className="text-sm mt-1 font-mono">{booking.reference}</p>
            </div>
            <div>
              <p className="field-label">Demo total</p>
              <p className="font-semibold mt-1">{money(booking.total)} USD</p>
            </div>
          </div>
          <p className="text-xs text-muted leading-5">
            No payment was taken, no email was sent, and no real reservation was
            made. You can find this demo booking in My bookings on this browser.
          </p>
        </div>
      </div>
      <div className="flex justify-center flex-wrap gap-3 mt-7">
        <Link className="button-primary" to="/bookings">
          View my bookings
          <ArrowRight size={16} />
        </Link>
        <Link className="button-secondary" to="/">
          Keep exploring
        </Link>
      </div>
    </div>
  );
}

export default function Bookings() {
  const { bookings } = useBookings();
  return (
    <section className="py-10">
      <p className="eyebrow">Good things to look forward to</p>
      <h1 className="page-title">My bookings</h1>
      <p className="text-sm text-muted mt-3">
        Your demo adventures, all in one place.
      </p>
      {bookings.length === 0 ? (
        <EmptyState
          heading="h2"
          title="Your next chapter starts with a stay"
          message="Find a place you love and try a demo booking. It will be waiting right here."
        />
      ) : (
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {bookings.map((booking) => {
            const stay = findStay(booking.listingId);
            return (
              <article className="reservation-card" key={booking.id}>
                <img src={stay.image} alt={stay.name} />
                <div className="p-5 flex-1">
                  <span className="confirmed-badge">Demo confirmed</span>
                  <h2 className="font-semibold mt-3">{stay.name}</h2>
                  <p className="text-sm text-muted mt-1">
                    {stay.city}, {stay.state}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-muted mt-4">
                    <CalendarDays size={14} />
                    {formatDate(booking.checkIn)} –{" "}
                    {formatDate(booking.checkOut)}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-muted mt-2">
                    <Users size={14} />
                    {booking.guests} guests · {money(booking.total)} total
                  </p>
                  <Link
                    to={`/confirmation/${booking.id}`}
                    className="inline-flex items-center gap-2 text-sm text-brand font-semibold mt-4"
                  >
                    View confirmation
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
