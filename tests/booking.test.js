import { describe, expect, it } from "vitest";
import { stays, defaultFilters } from "../src/data/stays";
import {
  createBooking,
  dayNumber,
  defaultSearch,
  filterStays,
  nightsBetween,
  tripPrice,
  validateTrip,
} from "../src/lib/booking";
import { loadData, saveData, STORAGE_KEY } from "../src/lib/storage";

const trip = {
  destination: "California",
  checkIn: "2090-11-13",
  checkOut: "2090-11-16",
  guests: 2,
};

describe("calendar days and pricing", () => {
  it("counts nights across month, year, leap-day and DST boundaries", () => {
    expect(nightsBetween("2026-01-30", "2026-02-02")).toBe(3);
    expect(nightsBetween("2026-12-31", "2027-01-03")).toBe(3);
    expect(nightsBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(nightsBetween("2026-03-07", "2026-03-10")).toBe(3);
    expect(nightsBetween("2026-10-31", "2026-11-03")).toBe(3);
  });
  it("rejects invalid dates, same-day checkout, past dates, and invalid guest counts", () => {
    expect(dayNumber("2026-02-30")).toBeNaN();
    expect(validateTrip({ ...trip, checkIn: "" })).toMatch("valid");
    expect(validateTrip({ ...trip, checkOut: trip.checkIn })).toMatch(
      "after check-in",
    );
    expect(validateTrip({ ...trip, checkIn: "2020-01-01" })).toMatch(
      "after today",
    );
    expect(validateTrip({ ...trip, guests: 0 })).toMatch("at least");
    expect(validateTrip({ ...trip, guests: 2.5 })).toMatch("at least");
    expect(validateTrip({ ...trip, guests: 3 }, 2)).toMatch("up to 2");
  });
  it("matches the twelve nightly rates and totals", () => {
    expect(stays.map((stay) => stay.price)).toEqual([
      240, 185, 210, 225, 195, 175, 265, 205, 285, 275, 345, 295,
    ]);
    expect(stays.map((stay) => tripPrice(stay, trip).total)).toEqual([
      720, 555, 630, 675, 585, 525, 795, 615, 855, 825, 1035, 885,
    ]);
    expect(tripPrice(stays[0], { ...trip, checkOut: trip.checkIn }).total).toBe(
      0,
    );
  });
  it("defaults to a valid three-night trip", () => {
    expect(validateTrip(defaultSearch())).toBe("");
    expect(
      nightsBetween(defaultSearch().checkIn, defaultSearch().checkOut),
    ).toBe(3);
  });
});

describe("combined filtering", () => {
  it("matches destination, type, price, amenities, and capacity together", () => {
    const results = filterStays(
      stays,
      { ...trip, destination: "palm", guests: 6 },
      {
        type: "Homes",
        minPrice: "180",
        maxPrice: "200",
        amenities: ["Pool", "Kitchen"],
      },
    );
    expect(results.map((stay) => stay.id)).toEqual(["palm-house"]);
  });
  it("supports property names, blank destinations, hotel filters and empty results", () => {
    expect(
      filterStays(
        stays,
        { ...trip, destination: "HOTEL JUNIPER" },
        defaultFilters,
      ),
    ).toHaveLength(1);
    expect(
      filterStays(stays, { ...trip, destination: "" }, defaultFilters),
    ).toHaveLength(12);
    expect(
      filterStays(stays, trip, { ...defaultFilters, type: "Hotels" }),
    ).toHaveLength(4);
    expect(
      filterStays(stays, { ...trip, guests: 7 }, defaultFilters),
    ).toHaveLength(0);
    expect(
      filterStays(stays, trip, { ...defaultFilters, maxPrice: "100" }),
    ).toHaveLength(0);
  });
});

describe("booking and storage", () => {
  it("creates a priced reservation without payment data and reloads it", () => {
    const booking = createBooking(
      stays[0],
      trip,
      { name: " Alex ", email: "alex@example.com" },
      "test-id",
    );
    expect(booking.total).toBe(720);
    expect(booking.guest.name).toBe("Alex");
    expect(booking).not.toHaveProperty("card");
    saveData({ favorites: ["seaside-cottage"], bookings: [booking] });
    expect(loadData().bookings).toEqual([booking]);
  });
  it("rejects bad guest details and trips", () => {
    expect(() =>
      createBooking(stays[0], trip, { name: " ", email: "bad" }),
    ).toThrow("guest name");
    expect(() =>
      createBooking(
        stays[0],
        { ...trip, guests: 8 },
        { name: "Alex", email: "alex@example.com" },
      ),
    ).toThrow("up to");
  });
  it("recovers from corrupt storage and skips malformed records", () => {
    localStorage.setItem(STORAGE_KEY, "{oops");
    expect(loadData()).toEqual({ favorites: [], bookings: [] });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        favorites: ["missing", "seaside-cottage", "seaside-cottage"],
        bookings: [{ id: "broken" }, null],
      }),
    );
    expect(loadData()).toEqual({
      favorites: ["seaside-cottage"],
      bookings: [],
    });
    expect(
      saveData(
        {},
        {
          setItem() {
            throw new Error("quota");
          },
        },
      ),
    ).toBe(false);
  });
});
