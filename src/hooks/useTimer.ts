"use client";

import { useState, useEffect } from "react";

function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function useTimer(horaInicio: string | null) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    // Compute start once, update seconds inside interval callback only
    const start = horaInicio ? new Date(horaInicio).getTime() : null;
    const id = setInterval(() => {
      setSeconds(start === null ? 0 : Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [horaInicio]);

  return { seconds, formatted: formatSeconds(seconds) };
}
