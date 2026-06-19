import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const FinalCTA = () => (
  <section className="py-28 bg-gradient-to-br from-[#0F172A] via-[#0F172A] to-[#1E293B] text-white border-t border-white/[0.06] relative overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

    <div className="container relative max-w-3xl mx-auto px-4 text-center">
      <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 text-white">
        Start Studying Smarter <span className="text-primary-light">Today.</span>
      </h2>

      <p className="text-slate-300 text-lg mb-10 max-w-xl mx-auto">
        Free access, instant AI tutoring, and daily improvement. Join thousands of students already learning smarter.
      </p>

      <div className="flex flex-wrap gap-4 justify-center">
        <Button className="bg-cta text-white hover:bg-cta/90 font-semibold h-12 px-8 rounded-xl text-sm gap-2 shadow-sm" asChild>
          <Link to="/signup">
            Sign Up Free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button variant="outline" className="border-white/10 text-white hover:bg-white/10 hover:text-white font-medium h-12 px-8 rounded-xl text-sm bg-transparent" asChild>
          <Link to="/login">Log In</Link>
        </Button>
      </div>
    </div>
  </section>
);


export default FinalCTA;