"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

export function Loader({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 min-h-[300px]">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        className="w-14 h-14 rounded-full border-t-3 border-[var(--accent-primary)] border-r-3 border-transparent flex items-center justify-center"
      >
        <Loader2 className="w-7 h-7 text-[var(--accent-secondary)] animate-spin" />
      </motion.div>
      <motion.p
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        transition={{ repeat: Infinity, duration: 1.5, repeatType: "reverse" }}
        className="text-base font-medium text-[var(--text-secondary)]"
      >
        {text}
      </motion.p>
    </div>
  );
}
