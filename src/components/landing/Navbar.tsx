import { Link } from "react-router-dom";
import { Home, Sparkles, Info } from "lucide-react";
import { NavBar } from "@/components/ui/tubelight-navbar";
import BrandMark from "@/components/BrandMark";

const navItems = [
  { name: 'Home', url: '/', icon: Home },
  { name: 'Features', url: '/#features', icon: Sparkles },
  { name: 'About Us', url: '/about', icon: Info },
];

interface NavbarProps {
  /**
   * Whether this navbar sits on a dark surface. True on the landing page,
   * whose hero is near-black; false on About, which is the light page
   * background. Both the wordmark and the nav pill need to know: rendered
   * onDark over a light page the wordmark is white-on-#F1F4F6 and effectively
   * invisible, which is how About shipped.
   */
  onDark?: boolean;
}

const Navbar = ({ onDark = true }: NavbarProps) => {
  return (
    <>
      <nav className="absolute top-0 w-full z-40 bg-transparent border-transparent pt-0 md:pt-1 shrink-0 transition-opacity pointer-events-none flex justify-center">
        <div className="w-full max-w-7xl px-4 flex relative justify-start">
          <Link to="/" className="ml-4 md:ml-8 lg:ml-12 h-16 md:h-20 shrink-0 z-10 pointer-events-auto inline-flex items-center transition-transform hover:opacity-90 active:scale-95 cursor-pointer">
            <BrandMark size="lg" onDark={onDark} />
          </Link>
        </div>
      </nav>

      {/* Floating tubelight navigation */}
      <NavBar items={navItems} onDark={onDark} />
    </>
  );
};

export default Navbar;
