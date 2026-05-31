import { motion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

export default function PageTransition() {
  const { pathname } = useLocation();

  return (
    <motion.div
      key={pathname}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-full"
    >
      <Outlet />
    </motion.div>
  );
}
