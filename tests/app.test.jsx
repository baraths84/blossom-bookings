import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { BookingProvider, useBookings } from "../src/BookingContext";
import { AppRoutes } from "../src/App";
import { loadData, saveData } from "../src/lib/storage";
import { createBooking, defaultSearch } from "../src/lib/booking";
import { stays } from "../src/data/stays";

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BookingProvider>
        <AppRoutes />
      </BookingProvider>
    </MemoryRouter>,
  );
}

it("completes checkout once, persists confirmation, and lists the booking", async () => {
  const user = userEvent.setup();
  const app = renderApp("/checkout/seaside-cottage");
  expect(screen.getByLabelText("Full name")).toHaveValue("Alex Morgan");
  const submit = screen.getByRole("button", { name: "Confirm demo booking" });
  await user.dblClick(submit);
  expect(
    screen.getByRole("heading", { name: /You’re all set/ }),
  ).toBeInTheDocument();
  expect(loadData().bookings).toHaveLength(1);
  const id = loadData().bookings[0].id;
  app.unmount();
  renderApp(`/confirmation/${id}`);
  expect(
    screen.getByRole("heading", { name: /You’re all set/ }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "View my bookings" }));
  expect(
    screen.getByRole("heading", { name: "My bookings" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "View confirmation" }),
  ).toBeInTheDocument();
});

it("prevents duplicate writes even if the same booking is submitted synchronously", () => {
  function Probe() {
    const { addBooking, bookings } = useBookings();
    return (
      <button
        onClick={() => {
          const booking = createBooking(
            stays[0],
            defaultSearch(),
            { name: "Alex", email: "alex@example.com" },
            "same-id",
          );
          addBooking(booking);
          addBooking(booking);
        }}
      >
        Count {bookings.length}
      </button>
    );
  }
  render(
    <BookingProvider>
      <Probe />
    </BookingProvider>,
  );
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("button")).toHaveTextContent("Count 1");
  expect(loadData().bookings).toHaveLength(1);
});

it("saves favorites, preserves theme, and confirms before reset", async () => {
  const user = userEvent.setup();
  saveData({
    favorites: [],
    bookings: [
      createBooking(stays[0], defaultSearch(), {
        name: "Alex",
        email: "alex@example.com",
      }),
    ],
  });
  const app = renderApp();
  await user.click(
    screen.getByRole("button", { name: "Save Seaside Cottage" }),
  );
  await user.click(screen.getByRole("button", { name: "Switch to dark mode" }));
  expect(loadData().favorites).toEqual(["seaside-cottage"]);
  app.unmount();
  renderApp("/saved");
  expect(
    screen.getByRole("heading", { name: "Seaside Cottage" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Switch to light mode" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reset demo" }));
  await user.click(screen.getByRole("button", { name: "Keep my data" }));
  expect(loadData().favorites).toHaveLength(1);
  expect(loadData().bookings).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Reset demo" }));
  await user.click(screen.getByRole("button", { name: "Reset demo data" }));
  expect(loadData()).toEqual({ favorites: [], bookings: [] });
  expect(localStorage.getItem("blossom-theme")).toBe("dark");
});

it("combines UI search and filters and clears an empty result", async () => {
  const user = userEvent.setup();
  renderApp();
  await user.click(screen.getByRole("button", { name: "Hotels", exact: true }));
  expect(screen.getAllByRole("article")).toHaveLength(4);
  await user.click(
    screen.getByRole("button", { name: "Filters", exact: true }),
  );
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByLabelText("Maximum"), "100");
  await user.click(within(dialog).getByRole("button", { name: "Show stays" }));
  expect(
    screen.getByRole("heading", { name: "No stays found just yet" }),
  ).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Clear search and filters" }),
  );
  expect(screen.getAllByRole("article")).toHaveLength(12);
  await user.clear(screen.getByLabelText("Destination"));
  await user.type(screen.getByLabelText("Destination"), "Malibu");
  await user.click(screen.getByRole("button", { name: "Search", exact: true }));
  await user.click(screen.getByRole("link", { name: "View Seaside Cottage" }));
  await user.click(screen.getByRole("link", { name: "All stays" }));
  expect(screen.getByLabelText("Destination")).toHaveValue("Malibu");
});

it("shows an actionable missing booking page", () => {
  renderApp("/confirmation/missing");
  expect(
    screen.getByRole("heading", { name: "This booking isn’t here" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Explore stays" }),
  ).toBeInTheDocument();
});

it("updates prices on date input and prevents same-day checkout", async () => {
  const user = userEvent.setup();
  renderApp("/checkout/seaside-cottage");
  const trip = defaultSearch();
  fireEvent.input(screen.getByLabelText("Check out"), {
    target: { value: trip.checkIn },
  });
  await user.click(
    screen.getByRole("button", { name: "Confirm demo booking" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Check-out must be after check-in.",
  );
  expect(loadData().bookings).toHaveLength(0);
  fireEvent.input(screen.getByLabelText("Check out"), {
    target: { value: trip.checkOut },
  });
  expect(screen.getByText("$240 × 3 nights")).toBeInTheDocument();
});

it("reproduces the BB-142 date handoff defect on the workshop baseline", async () => {
  const user = userEvent.setup();
  const trip = defaultSearch();
  renderApp("/stays/seaside-cottage");
  // Use calendar arithmetic so the exercise also works near month boundaries.
  const { addDays } = await import("../src/lib/booking");
  const checkOut = addDays(trip.checkIn, 5);
  fireEvent.input(screen.getByLabelText("Check out"), {
    target: { value: checkOut },
  });
  expect(screen.getByText("$240 × 5 nights")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reserve this stay" }));
  expect(screen.getByLabelText("Check out")).toHaveValue(trip.checkOut);
  expect(screen.getByText("$240 × 3 nights")).toBeInTheDocument();
});
