import { useState } from "react";
import { SlidersHorizontal, House, Building2, LayoutGrid } from "lucide-react";
import { useBookings } from "../BookingContext";
import { defaultFilters, filterAmenities } from "../data/stays";
import Dialog from "./Dialog";

export default function Filters() {
  const { filters, setFilters } = useBookings();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState("");
  const activeCount =
    filters.amenities.length +
    (filters.minPrice !== "" ? 1 : 0) +
    (filters.maxPrice !== "" ? 1 : 0);
  const types = [
    ["All stays", LayoutGrid],
    ["Homes", House],
    ["Hotels", Building2],
  ];
  function apply(event) {
    event.preventDefault();
    if (
      draft.minPrice !== "" &&
      draft.maxPrice !== "" &&
      Number(draft.minPrice) > Number(draft.maxPrice)
    ) {
      setError("Maximum price must be at least the minimum price.");
      return;
    }
    setFilters(draft);
    setOpen(false);
  }
  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-8">
        <div className="flex gap-2" aria-label="Property type">
          {types.map(([type, Icon]) => (
            <button
              key={type}
              className={`type-tab ${filters.type === type ? "selected" : ""}`}
              aria-pressed={filters.type === type}
              onClick={() => setFilters({ ...filters, type })}
            >
              <Icon size={16} />
              <span>{type}</span>
            </button>
          ))}
        </div>
        <button
          className="button-secondary filter-button"
          onClick={(event) => {
            event.currentTarget.focus();
            setDraft(filters);
            setError("");
            setOpen(true);
          }}
        >
          <SlidersHorizontal size={16} />
          Filters
          {activeCount > 0 && (
            <span className="filter-count">{activeCount}</span>
          )}
        </button>
      </div>
      {open && (
        <Dialog title="Find your kind of stay" onClose={() => setOpen(false)}>
          <form onSubmit={apply} className="p-6">
            <fieldset>
              <legend className="font-semibold">Price per night</legend>
              <p className="text-sm text-muted mt-1 mb-4">
                Choose your budget in USD.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="form-label">
                  Minimum
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="$0"
                    value={draft.minPrice}
                    onChange={(event) =>
                      setDraft({ ...draft, minPrice: event.target.value })
                    }
                  />
                </label>
                <label className="form-label">
                  Maximum
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Any price"
                    value={draft.maxPrice}
                    onChange={(event) =>
                      setDraft({ ...draft, maxPrice: event.target.value })
                    }
                  />
                </label>
              </div>
            </fieldset>
            <fieldset className="mt-7">
              <legend className="font-semibold mb-4">
                The little essentials
              </legend>
              <div className="grid grid-cols-2 gap-4">
                {filterAmenities.map((amenity) => (
                  <label
                    key={amenity}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={draft.amenities.includes(amenity)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          amenities: event.target.checked
                            ? [...draft.amenities, amenity]
                            : draft.amenities.filter(
                                (item) => item !== amenity,
                              ),
                        })
                      }
                    />
                    {amenity}
                  </label>
                ))}
              </div>
            </fieldset>
            {error && (
              <p className="text-error text-sm mt-4" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-between items-center gap-4 mt-8">
              <button
                type="button"
                className="text-sm underline underline-offset-4"
                onClick={() =>
                  setDraft({ ...defaultFilters, type: filters.type })
                }
              >
                Clear filters
              </button>
              <button className="button-primary" type="submit">
                Show stays
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
