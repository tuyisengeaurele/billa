import { useEffect, useState } from "react";
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

const DOCS = [RECEIPT, QUOTE, INVOICE];

const SLOTS = [
  { x: 0, y: 0, rotate: 0, opacity: 1, zIndex: 30 },
  { x: 32, y: -18, rotate: 8, opacity: 0.95, zIndex: 20 },
  { x: -32, y: 24, rotate: -10, opacity: 0.9, zIndex: 10 },
];

const SHUFFLE_INTERVAL_MS = 8000;

export function DocumentPreviewStack() {
  const [order, setOrder] = useState([2, 1, 0]);

  useEffect(() => {
    const interval = setInterval(() => {
      setOrder(([front, middle, back]) => [back, front, middle]);
    }, SHUFFLE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative flex h-[340px] w-full max-w-md items-center justify-center sm:h-[420px]">
      {DOCS.map((doc, docIndex) => {
        const slotIndex = order.indexOf(docIndex);
        const slot = SLOTS[slotIndex];
        const isFront = slotIndex === 0;

        return (
          <motion.div
            key={doc.number}
            initial={{ opacity: 0, y: slot.y + 40, x: slot.x, rotate: slot.rotate }}
            animate={{ opacity: slot.opacity, y: slot.y, x: slot.x, rotate: slot.rotate }}
            whileHover={isFront ? { rotate: 0, scale: 1.02 } : undefined}
            transition={{ duration: isFront ? 0.6 : 1, delay: docIndex * 0.15, ease: "easeInOut" }}
            className={isFront ? "absolute" : "absolute hidden sm:block"}
            style={{ zIndex: slot.zIndex }}
          >
            <DocumentPreviewCard {...doc} />
          </motion.div>
        );
      })}
    </div>
  );
}
