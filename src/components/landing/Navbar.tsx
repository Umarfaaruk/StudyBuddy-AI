import { Link } from "react-router-dom";
import { Home, Sparkles, Info } from "lucide-react";
import { NavBar } from "@/components/ui/tubelight-navbar";
import eduonxLogoOnDark from "@/assets/eduonx-logo-on-dark.png";

const navItems = [
  { name: 'Home', url: '/', icon: Home },
  { name: 'Features', url: '/#features', icon: Sparkles },
  { name: 'About Us', url: '/about', icon: Info },
];

const Navbar = () => {
  return (
    <>
      <nav className="absolute top-0 w-full z-40 bg-transparent border-transparent pt-0 md:pt-1 shrink-0 transition-opacity pointer-events-none flex justify-center">
        <div className="w-full max-w-7xl px-4 flex relative justify-start">
          <Link to="/" className="ml-4 md:ml-8 lg:ml-12 h-16 md:h-20 shrink-0 z-10 pointer-events-auto inline-flex items-center transition-transform hover:opacity-90 active:scale-95 cursor-pointer">
            <img 
              src={eduonxLogoOnDark} 
              alt="EduOnx Logo" 
              className="block h-10 md:h-12 lg:h-14 w-auto max-w-[240px] object-contain object-left" 
            />
          </Link>
        </div>
      </nav>

      {/* Floating tubelight navigation */}
      <NavBar items={navItems} />
    </>
  );
};

export default Navbar;
