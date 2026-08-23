import { motion } from "framer-motion";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onAnimationStart" | "onAnimationEnd" | "onDrag" | "onDragStart" | "onDragEnd"
>;

interface ButtonProps extends NativeButtonProps {
  isLoading?: boolean;
  variant?: "primary" | "outline";
  fullWidth?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<"primary" | "outline", string> = {
  primary: "bg-primary-500 text-white hover:bg-primary-700",
  outline: "border border-neutral-200 bg-surface text-neutral-900 hover:bg-neutral-50",
};

const SPINNER_CLASSES: Record<"primary" | "outline", string> = {
  primary: "border-white/40 border-t-white",
  outline: "border-neutral-300 border-t-neutral-700",
};

export function Button({
  isLoading,
  variant = "primary",
  fullWidth = true,
  children,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <motion.button
      whileHover={{ scale: isDisabled ? 1 : 1.01 }}
      whileTap={{ scale: isDisabled ? 1 : 0.98 }}
      disabled={isDisabled}
      className={`flex items-center justify-center rounded-lg px-4 py-2.5 font-sans text-sm font-semibold shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70 disabled:shadow-none ${fullWidth ? "w-full" : ""} ${VARIANT_CLASSES[variant]} ${className ?? ""}`}
      {...props}
    >
      {isLoading ? (
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
          className={`h-4 w-4 rounded-full border-2 ${SPINNER_CLASSES[variant]}`}
          aria-hidden="true"
        />
      ) : (
        children
      )}
    </motion.button>
  );
}
