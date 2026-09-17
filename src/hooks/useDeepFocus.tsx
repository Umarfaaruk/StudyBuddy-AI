import { createContext, useContext, useState, useCallback, ReactNode, useMemo } from "react";

interface DeepFocusContextType {
  isDeepFocus: boolean;
  enableDeepFocus: () => void;
  disableDeepFocus: () => void;
  toggleDeepFocus: () => void;
}

const DeepFocusContext = createContext<DeepFocusContextType | undefined>(undefined);

export const DeepFocusProvider = ({ children }: { children: ReactNode }) => {
  const [isDeepFocus, setIsDeepFocus] = useState(false);

  const enableDeepFocus = useCallback(() => {
    setIsDeepFocus(true);
    document.documentElement.classList.add("deep-focus");
  }, []);

  const disableDeepFocus = useCallback(() => {
    setIsDeepFocus(false);
    document.documentElement.classList.remove("deep-focus");
  }, []);

  const toggleDeepFocus = useCallback(() => {
    setIsDeepFocus((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add("deep-focus");
      } else {
        document.documentElement.classList.remove("deep-focus");
      }
      return next;
    });
  }, []);

  // Memoised: an inline object literal re-renders every consumer each render.
  const value = useMemo(
    () => ({ isDeepFocus, enableDeepFocus, disableDeepFocus, toggleDeepFocus }),
    [isDeepFocus, enableDeepFocus, disableDeepFocus, toggleDeepFocus]
  );

  return (
    <DeepFocusContext.Provider value={value}>
      {children}
    </DeepFocusContext.Provider>
  );
};

export const useDeepFocus = () => {
  const ctx = useContext(DeepFocusContext);
  if (!ctx) throw new Error("useDeepFocus must be used within DeepFocusProvider");
  return ctx;
};
