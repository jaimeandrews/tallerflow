"use client";

import { useState } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

type PinState = "idle" | "loading" | "error" | "success";

interface PinInputProps {
  onSubmit: (pin: string) => Promise<void>;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"] as const;

export function PinInput({ onSubmit }: PinInputProps) {
  const [digits, setDigits] = useState<string[]>([]);
  const [state, setState] = useState<PinState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleKey = async (k: string) => {
    if (state === "loading" || state === "success") return;

    if (k === "del") {
      setDigits((prev) => prev.slice(0, -1));
      return;
    }
    if (k === "ok") {
      if (digits.length !== 4) return;
      await submit(digits);
      return;
    }

    const next = [...digits, k];
    setDigits(next);
    if (next.length === 4) await submit(next);
  };

  const submit = async (d: string[]) => {
    setState("loading");
    try {
      await onSubmit(d.join(""));
      setState("success");
    } catch {
      setState("error");
      setErrorMsg("PIN inválido");
      setTimeout(() => {
        setDigits([]);
        setState("idle");
        setErrorMsg("");
      }, 1500);
    }
  };

  const dotClass = (i: number) => {
    const filled = i < digits.length;
    const base = "w-5 h-5 rounded-full border-2 transition-all duration-200";
    if (state === "error") return cn(base, "border-red-500 bg-red-500");
    if (state === "success") return cn(base, "border-green-500 bg-green-500");
    if (state === "loading") return cn(base, "border-blue-400 bg-blue-400 animate-pulse");
    return cn(base, filled ? "border-[#00AEEF] bg-[#00AEEF]" : "border-white/30 bg-transparent");
  };

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Dots */}
      <div className={cn("flex gap-5", state === "error" && "animate-shake")}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={dotClass(i)} />
        ))}
      </div>

      {/* Error */}
      <p
        className={cn(
          "text-sm h-4 transition-opacity",
          state === "error" ? "text-red-400 opacity-100" : "opacity-0"
        )}
      >
        {errorMsg}
      </p>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => handleKey(k)}
            disabled={state === "loading" || state === "success"}
            className={cn(
              "w-20 h-20 rounded-2xl flex items-center justify-center",
              "text-white text-2xl font-semibold",
              "transition-all duration-100 active:scale-[0.93]",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              k === "ok" && digits.length === 4
                ? "bg-[#2C8A4A] hover:bg-[#35a35a] shadow-lg shadow-[#2C8A4A]/30"
                : k === "ok"
                  ? "bg-white/5 text-white/30"
                  : "bg-white/8 hover:bg-white/15 border border-white/10"
            )}
          >
            {k === "del" ? <Delete size={22} /> : k === "ok" ? "✓" : k}
          </button>
        ))}
      </div>
    </div>
  );
}
