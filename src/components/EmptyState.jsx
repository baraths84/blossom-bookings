import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

export default function EmptyState({
  title = "This page took a little detour",
  message = "We couldn’t find what you’re looking for. A new escape is just a click away.",
  children,
  heading: Heading = "h1",
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Compass size={28} />
      </span>
      <Heading className="text-2xl font-semibold mt-5">{title}</Heading>
      <p className="text-muted mt-3 max-w-md mx-auto leading-relaxed">
        {message}
      </p>
      <div className="mt-6">
        {children || (
          <Link className="button-primary inline-flex" to="/">
            Explore stays
          </Link>
        )}
      </div>
    </div>
  );
}
