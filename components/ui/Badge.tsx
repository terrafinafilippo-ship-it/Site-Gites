import type { CSSProperties, ReactNode } from "react";

export interface BadgeProps {
  /** Pills réutilisables — classes .badge-pill / .badge-target / .badge-gdf de globals.css. */
  variant?: "default" | "target" | "gdf";
  children: ReactNode;
  style?: CSSProperties;
}

export default function Badge({ variant = "default", children, style }: BadgeProps) {
  const variantClass =
    variant === "target" ? " badge-target" :
    variant === "gdf" ? " badge-gdf" :
    "";
  return (
    <span className={`badge-pill${variantClass}`} style={style}>
      {children}
    </span>
  );
}
