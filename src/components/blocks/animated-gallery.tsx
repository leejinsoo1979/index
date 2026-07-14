"use client";

import React from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type HTMLMotionProps,
  type MotionValue,
  type SpringOptions,
} from "motion/react";

import { cn } from "@/lib/utils";

interface ContainerScrollContextValue {
  scrollYProgress: MotionValue<number>;
}

const SPRING_CONFIG: SpringOptions = {
  stiffness: 120,
  damping: 20,
  mass: 0.6,
};

const ContainerScrollContext = React.createContext<
  ContainerScrollContextValue | undefined
>(undefined);

function useContainerScrollContext() {
  const context = React.useContext(ContainerScrollContext);
  if (!context) {
    throw new Error(
      "useContainerScrollContext must be used within <ContainerScroll />",
    );
  }
  return context;
}

export const ContainerScroll: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className,
  ...props
}) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: scrollRef });
  return (
    <ContainerScrollContext.Provider value={{ scrollYProgress }}>
      <div
        ref={scrollRef}
        className={cn("relative min-h-[120vh]", className)}
        {...props}
      >
        {children}
      </div>
    </ContainerScrollContext.Provider>
  );
};

export const ContainerSticky = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("sticky left-0 top-0 w-full overflow-hidden", className)}
    {...props}
  />
));
ContainerSticky.displayName = "ContainerSticky";

export const GalleryContainer = React.forwardRef<
  HTMLDivElement,
  HTMLMotionProps<"div">
>(({ className, style, ...props }, ref) => {
  const { scrollYProgress } = useContainerScrollContext();
  const rotateX = useSpring(
    useTransform(scrollYProgress, [0, 0.35], [55, 0]),
    SPRING_CONFIG,
  );
  const scale = useSpring(
    useTransform(scrollYProgress, [0.35, 0.65], [1.05, 1]),
    SPRING_CONFIG,
  );

  return (
    <motion.div
      ref={ref}
      className={cn(
        "relative grid size-full grid-cols-3 gap-2 rounded-2xl",
        className,
      )}
      style={{
        rotateX,
        scale,
        transformStyle: "preserve-3d",
        transformPerspective: 1000,
        ...style,
      }}
      {...props}
    />
  );
});
GalleryContainer.displayName = "GalleryContainer";

type GalleryColProps = HTMLMotionProps<"div"> & {
  /** Parallax range mapped to the second half of the scroll progress. */
  yRange?: [string, string];
};

export const GalleryCol = React.forwardRef<HTMLDivElement, GalleryColProps>(
  ({ className, style, yRange = ["0%", "-10%"], ...props }, ref) => {
    const { scrollYProgress } = useContainerScrollContext();
    const y = useTransform(scrollYProgress, [0.35, 1], yRange);
    return (
      <motion.div
        ref={ref}
        className={cn("relative flex w-full flex-col gap-2", className)}
        style={{ y, ...style }}
        {...props}
      />
    );
  },
);
GalleryCol.displayName = "GalleryCol";

/** Overlay that fades out while the gallery flattens (progress 0 → 0.3). */
export const GalleryFadeOverlay = React.forwardRef<
  HTMLDivElement,
  HTMLMotionProps<"div">
>(({ className, style, ...props }, ref) => {
  const { scrollYProgress } = useContainerScrollContext();
  // explicit clamp — once the gallery has flattened (progress ≥ 0.3) the
  // glow must stay at 0 for the rest of the scroll, never re-appear
  const opacity = useTransform(scrollYProgress, (v) =>
    Math.min(1, Math.max(0, 1 - v / 0.3)),
  );
  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ opacity, ...style }}
      {...props}
    />
  );
});
GalleryFadeOverlay.displayName = "GalleryFadeOverlay";

export const ContainerStagger = React.forwardRef<
  HTMLDivElement,
  HTMLMotionProps<"div">
>(({ className, transition, ...props }, ref) => (
  <motion.div
    ref={ref}
    className={cn(className)}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true }}
    transition={{ staggerChildren: 0.2, delayChildren: 0.2, ...transition }}
    {...props}
  />
));
ContainerStagger.displayName = "ContainerStagger";

export const ContainerAnimated = React.forwardRef<
  HTMLDivElement,
  HTMLMotionProps<"div">
>(({ className, transition, ...props }, ref) => (
  <motion.div
    ref={ref}
    className={cn(className)}
    variants={{
      hidden: { opacity: 0, y: 24 },
      visible: { opacity: 1, y: 0 },
    }}
    transition={{ duration: 0.45, ease: "easeOut", ...transition }}
    {...props}
  />
));
ContainerAnimated.displayName = "ContainerAnimated";
