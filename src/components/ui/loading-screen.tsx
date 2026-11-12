import Logo from "@/components/logo";
import { motion } from "motion/react";

interface LoadingScreenProps {
  isLoading: boolean;
  message?: string;
}

export const LoadingScreen = ({ isLoading, message }: LoadingScreenProps) => {
  if (!isLoading) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center gap-4"
      >
        <div className="flex flex-col items-center justify-center h-full text-center p-4">
          <div className="flex items-center justify-center mb-1 text-primary">
            <Logo width={80} height={80} />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Enjoy Your Talk</h2>
          {message && <p className="text-muted-foreground  animate-pulse">{message}</p>}
        </div>
      </motion.div>
    </div>
  );
};
