import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

const FinalCTA = () => (
  <section className="py-28 bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-foreground border-t border-border relative overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

    <div className="container relative max-w-3xl mx-auto px-4 text-center">
      <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 text-foreground">
        Start Studying Smarter <span className="text-primary">Today.</span>
      </h2>

      <p className="text-accent/90 text-lg mb-10 max-w-xl mx-auto">
        Free access, instant AI tutoring, and daily improvement. Join thousands of students already learning smarter.
      </p>

      <div className="flex flex-wrap gap-4 justify-center">
        <Button className="bg-cta text-white hover:bg-cta/90 font-semibold h-12 px-8 rounded-xl text-sm gap-2 shadow-sm" asChild>
          <Link to="/signup">
            Sign Up Free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button variant="outline" className="border-border text-foreground hover:bg-muted font-medium h-12 px-8 rounded-xl text-sm bg-white" asChild>
          <Link to="/login">Log In</Link>
        </Button>
      </div>
    </div>
  </section>
);


export default FinalCTA;