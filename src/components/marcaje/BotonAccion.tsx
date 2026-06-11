"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "warning" | "success" | "neutral" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-[#00AEEF] hover:bg-[#00bfff] text-white shadow-[0_0_20px_#00AEEF30]",
  warning: "bg-[#F4A91A] hover:bg-[#f5b83a] text-black shadow-[0_0_20px_#F4A91A30]",
  success: "bg-[#2C8A4A] hover:bg-[#35a35a] text-white shadow-[0_0_20px_#2C8A4A30]",
  neutral: "bg-white/8 hover:bg-white/15 text-white border border-white/15",
  danger: "bg-[#E82C2C] hover:bg-[#f03535] text-white shadow-[0_0_20px_#E82C2C30]",
};

interface BotonAccionProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void | Promise<void>;
  variant?: Variant;
  disabled?: boolean;
  className?: string;
}

export function BotonAccion({
  label,
  icon,
  onClick,
  variant = "neutral",
  disabled,
  className,
}: BotonAccionProps) {
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (loading || disabled) return;
    setLoading(true);
    try {
      await onClick();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handle}
      disabled={disabled || loading}
      className={cn(
        "flex flex-col items-center justify-center gap-2 p-5 rounded-2xl",
        "font-bold text-xs uppercase tracking-widest",
        "transition-all duration-150 active:scale-95",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
        VARIANT[variant],
        className
      )}
    >
      <span className="text-2xl">
        {loading ? <Loader2 size={26} className="animate-spin" /> : icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
