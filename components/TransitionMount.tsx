"use client";

import { useEffect } from "react";

export default function TransitionMount() {
  useEffect(() => {
    document.body.classList.remove("no-transition");
  }, []);

  return null;
}
