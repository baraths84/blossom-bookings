import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Heart,
  Luggage,
  RotateCcw,
  ArrowUpRight,
} from "lucide-react";
import { useBookings } from "../BookingContext";
import ThemeSelector from "./ThemeSelector";
import Dialog from "./Dialog";
import blackLogo from "../../logo/blossom-bookings-stacked.png";
import whiteLogo from "../../logo/blossom-bookings-light-clean.png";

export default function Layout() {
  const { theme, resetDemo, storageError } = useBookings();
  const [resetOpen, setResetOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="min-h-screen flex flex-col">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        <div className="site-header page-width">
          <Link to="/" className="brand" aria-label="Blossom Bookings home">
            <img
              src={theme === "dark" ? whiteLogo : blackLogo}
              alt="Blossom Bookings"
            />
          </Link>
          <nav className="main-nav" aria-label="Main navigation">
            <NavLink
              end
              to="/"
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              Stays
            </NavLink>
            <NavLink
              to="/saved"
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <Heart size={17} /> Saved
            </NavLink>
            <NavLink
              to="/bookings"
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <Luggage size={17} /> My bookings
            </NavLink>
          </nav>
          <div className="header-actions">
          <ThemeSelector />
          </div>
        </div>
      </header>
      {storageError && (
        <p role="alert" className="page-width mt-4 text-sm text-error">
          Browser storage is unavailable. Your changes work now but may not
          survive a refresh.
        </p>
      )}
      <main
        id="main-content"
        className="page-width flex-1 w-full"
        tabIndex={-1}
      >
        <Outlet />
      </main>
      <footer className="border-t border-line mt-16">
        <div className="page-width footer-inner">
          <div>
            <p className="font-semibold text-ink">
              Good places. Great possibilities.
            </p>
            <p className="mt-1 text-xs text-muted">
              © {new Date().getFullYear()} Blossom Bookings · A fictional stays
              demo
            </p>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted">
            <span className="flex items-center gap-1">
              Made for exploring <ArrowUpRight size={14} />
            </span>
            <button
              onClick={(event) => {
                event.currentTarget.focus();
                setResetOpen(true);
              }}
              className="flex items-center gap-2 hover:text-ink"
            >
              <RotateCcw size={13} />
              Reset demo
            </button>
          </div>
        </div>
      </footer>
      {resetOpen && (
        <Dialog title="Reset your demo?" onClose={() => setResetOpen(false)}>
          <div className="p-6">
            <p className="text-muted leading-relaxed">
              This clears your saved stays and demo bookings from this browser.
              Your color theme will stay the same.
            </p>
            <div className="flex justify-end gap-3 mt-7">
              <button
                className="button-secondary"
                onClick={() => setResetOpen(false)}
              >
                Keep my data
              </button>
              <button
                className="button-primary"
                onClick={() => {
                  resetDemo();
                  setResetOpen(false);
                }}
              >
                Reset demo data
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
