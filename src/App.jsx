import { BrowserRouter, Route, Routes } from "react-router-dom";
import { BookingProvider } from "./BookingContext";
import Layout from "./components/Layout";
import EmptyState from "./components/EmptyState";
import Explore from "./pages/Explore";
import StayDetails from "./pages/StayDetails";
import Checkout from "./pages/Checkout";
import Bookings, { Confirmation } from "./pages/Bookings";
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Explore />} />
        <Route path="saved" element={<Explore saved />} />
        <Route path="stays/:id" element={<StayDetails />} />
        <Route path="checkout/:id" element={<Checkout />} />
        <Route path="confirmation/:id" element={<Confirmation />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="*" element={<EmptyState />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <BookingProvider>
        <AppRoutes />
      </BookingProvider>
    </BrowserRouter>
  );
}
