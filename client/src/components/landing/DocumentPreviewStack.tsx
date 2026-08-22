import { motion } from "framer-motion";
import { DocumentPreviewCard } from "./DocumentPreviewCard";

const RECEIPT = {
  typeLabel: "Receipt",
  number: "REC-0012",
  businessName: "Kigali Traders",
  lines: [{ label: "Payment received", amount: 59000 }],
  subtotal: 59000,
  total: 59000,
};

const QUOTE = {
  typeLabel: "Quote",
  number: "QUO-0007",
  businessName: "Kigali Traders",
  lines: [
    { label: "Website redesign", amount: 350000 },
    { label: "Hosting, 1 year", amount: 60000 },
  ],
  subtotal: 410000,
  taxAmount: 73800,
  total: 483800,
};

const INVOICE = {
  typeLabel: "Invoice",
  number: "INV-0004",
  businessName: "Kigali Traders",
  lines: [
    { label: "3 bags of cement", amount: 45000 },
    { label: "Delivery, Kicukiro", amount: 5000 },
  ],
  subtotal: 50000,
  taxAmount: 9000,
  total: 59000,
};

export function DocumentPreviewStack() {
  return (
    <div className="relative flex h-[340px] w-full max-w-md items-center justify-center sm:h-[420px]">
      <motion.div
        initial={{ opacity: 0, y: 60, x: -32, rotate: -12 }}
        animate={{ opacity: 1, y: 24, x: -32, rotate: -10 }}
        transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
        className="absolute hidden sm:block"
        style={{ zIndex: 10 }}
      >
        <DocumentPreviewCard {...RECEIPT} className="opacity-90" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 60, x: 32, rotate: 12 }}
        animate={{ opacity: 1, y: -18, x: 32, rotate: 8 }}
        transition={{ duration: 0.6, delay: 0.25, ease: "easeOut" }}
        className="absolute hidden sm:block"
        style={{ zIndex: 20 }}
      >
        <DocumentPreviewCard {...QUOTE} className="opacity-95" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 16, rotate: -3 }}
        animate={{ opacity: 1, y: 0, rotate: -3 }}
        whileHover={{ rotate: 0, scale: 1.02 }}
        transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
        className="absolute"
        style={{ zIndex: 30 }}
      >
        <DocumentPreviewCard {...INVOICE} />
      </motion.div>
    </div>
  );
}
