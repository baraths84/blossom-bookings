import { money, tripPrice } from "../lib/booking";

export default function PriceSummary({ stay, trip }) {
  const { nights, total } = tripPrice(stay, trip);
  return (
    <div className="price-summary">
      <div className="flex justify-between text-sm text-muted">
        <span>
          {money(stay.price)} ×{" "}
          {Number.isFinite(nights) && nights > 0 ? nights : "—"} nights
        </span>
        <span>{money(total)}</span>
      </div>
      <div className="flex justify-between font-semibold border-t border-line pt-5 mt-5">
        <span>
          Total <span className="text-xs font-normal text-muted">(USD)</span>
        </span>
        <span>{money(total)}</span>
      </div>
      <p className="text-xs text-muted mt-3">
        No additional fees or taxes in this demo.
      </p>
    </div>
  );
}
