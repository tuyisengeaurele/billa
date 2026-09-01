import { motion, useReducedMotion } from "framer-motion";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

const SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-10 w-10 border-[3px]",
};

export function Spinner({ size = "md", label = "Loading", className = "" }: SpinnerProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div role="status" className={`inline-flex items-center gap-2.5 ${className}`}>
      <motion.span
        animate={shouldReduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
        className={`rounded-full border-neutral-200 border-t-primary-500 ${SIZE_CLASSES[size]}`}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
