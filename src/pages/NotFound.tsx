import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface">
      <h1 className="font-sora text-6xl font-bold text-navy">404</h1>
      <p className="mt-2 text-lg text-muted">Page not found</p>
      <Link to="/dashboard" className="mt-6">
        <Button className="rounded-lg bg-gold text-card hover:bg-gold/90">
          Go to Dashboard
        </Button>
      </Link>
    </div>
  );
}
