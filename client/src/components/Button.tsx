import { motion } from "framer-motion";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onAnimationStart" | "onAnimationEnd" | "onDrag" | "onDragStart" | "onDragEnd"
>;

interface ButtonProps extends NativeButtonProps {
  isLoading?: boolean;
  children: ReactNode;
}

export function Button({ isLoading, children, disabled, className, ...props }: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <motion.button
      whileHover={{ scale: isDisabled ? 1 : 1.01 }}
      whileTap={{ scale: isDisabled ? 1 : 0.98 }}
      disabled={isDisabled}
      className={`flex w-full items-center justify-center rounded-lg bg-primary-500 px-4 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70 ${className ?? ""}`}
      {...props}
    >
      {isLoading ? (
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
          className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white"
          aria-hidden="true"
        />
      ) : (
        children
      )}
    </motion.button>
  );
}
