import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import {
  AnimatePresence,
  LazyMotion,
  m,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import type { FeatureBundle, Transition, Variants } from 'motion/react';

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

const loadFeatures = (): Promise<FeatureBundle> =>
  import('@/components/motion-features').then((mod) => mod.default);

/**
 * Animation features are loaded asynchronously: the initial bundle ships only
 * the tiny `m` renderer, and transitions light up a moment later.
 */
export function MotionProvider({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT_QUART = [0.76, 0, 0.24, 1] as const;

export const springSoft: Transition = { type: 'spring', stiffness: 220, damping: 26, mass: 0.9 };
export const springSnappy: Transition = { type: 'spring', stiffness: 420, damping: 30 };

/* -------------------------------------------------------------------------- */
/* Scroll reveal                                                              */
/* -------------------------------------------------------------------------- */

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Distance travelled in px. */
  y?: number;
  once?: boolean;
  as?: 'div' | 'section' | 'li' | 'span' | 'article' | 'header' | 'footer';
  style?: CSSProperties;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/** Fades and lifts content into place the first time it scrolls into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
  once = true,
  as = 'div',
  style,
  id,
  ...aria
}: RevealProps): React.ReactElement {
  const reduce = useReducedMotion();
  const Comp = m[as];
  return (
    <Comp
      id={id}
      className={className}
      style={style}
      {...aria}
      initial={reduce ? false : { opacity: 0, y, filter: 'blur(8px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.9, ease: EASE_OUT_EXPO, delay }}
    >
      {children}
    </Comp>
  );
}

export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: EASE_OUT_EXPO } },
};

interface StaggerProps {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'ul' | 'ol' | 'section';
  amount?: number;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/** Container whose children (StaggerItem) cascade in. */
export function Stagger({ children, className, as = 'div', amount = 0.1, ...aria }: StaggerProps): React.ReactElement {
  const reduce = useReducedMotion();
  const Comp = m[as];
  return (
    <Comp
      className={className}
      variants={reduce ? undefined : staggerContainer}
      initial={reduce ? undefined : 'hidden'}
      whileInView={reduce ? undefined : 'show'}
      viewport={{ once: true, amount }}
      {...aria}
    >
      {children}
    </Comp>
  );
}

export function StaggerItem({
  children,
  className,
  as = 'div',
  style,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li' | 'article';
  style?: CSSProperties;
}): React.ReactElement {
  const reduce = useReducedMotion();
  const Comp = m[as];
  return (
    <Comp className={className} style={style} variants={reduce ? undefined : staggerItem}>
      {children}
    </Comp>
  );
}

/* -------------------------------------------------------------------------- */
/* Headline word reveal                                                       */
/* -------------------------------------------------------------------------- */

interface WordsProps {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
}

/** Splits a headline into words that rise up one after another. */
export function Words({ text, className, delay = 0, stagger = 0.045 }: WordsProps): React.ReactElement {
  const reduce = useReducedMotion();
  const words = text.split(' ');
  return (
    <span className={className} aria-label={text} role="text">
      {words.map((word, index) => (
        <span key={`${word}-${index}`} className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom" aria-hidden>
          <m.span
            className="inline-block will-change-transform"
            initial={reduce ? false : { y: '110%', rotate: 3, opacity: 0 }}
            animate={{ y: '0%', rotate: 0, opacity: 1 }}
            transition={{ duration: 0.9, ease: EASE_OUT_EXPO, delay: delay + index * stagger }}
          >
            {word}
            {index < words.length - 1 ? '\u00a0' : ''}
          </m.span>
        </span>
      ))}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Page transition                                                            */
/* -------------------------------------------------------------------------- */

interface PageTransitionProps {
  pageKey: string;
  children: ReactNode;
}

export function PageTransition({ pageKey, children }: PageTransitionProps): React.ReactElement {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={pageKey}
        initial={reduce ? false : { opacity: 0, y: 14, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={reduce ? undefined : { opacity: 0, y: -10, filter: 'blur(4px)', transition: { duration: 0.22, ease: 'easeIn' } }}
        transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
        className="min-w-0"
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/* Pointer-driven                                                             */
/* -------------------------------------------------------------------------- */

interface MagneticProps {
  children: ReactNode;
  className?: string;
  /** How far the element follows the pointer, 0–1. */
  strength?: number;
}

/** The element leans toward the cursor while hovered, then springs back. */
export function Magnetic({ children, className, strength = 0.35 }: MagneticProps): React.ReactElement {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 18, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 260, damping: 18, mass: 0.6 });

  const onMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (reduce || e.pointerType === 'touch') return;
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left - rect.width / 2) * strength);
    y.set((e.clientY - rect.top - rect.height / 2) * strength);
  };
  const reset = (): void => {
    x.set(0);
    y.set(0);
  };

  return (
    <m.div className={`inline-block ${className ?? ''}`} style={{ x: sx, y: sy }} onPointerMove={onMove} onPointerLeave={reset}>
      {children}
    </m.div>
  );
}

interface SpotlightProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'article' | 'section' | 'li';
}

/** Sets --mx/--my so the `.spot` CSS spotlight follows the pointer. */
export function Spotlight({ children, className = '', style, as = 'div' }: SpotlightProps): React.ReactElement {
  const ref = useRef<HTMLElement | null>(null);
  const onMove = (e: ReactPointerEvent<HTMLElement>): void => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`);
  };
  const props = {
    ref: ref as React.Ref<HTMLDivElement>,
    className: `spot ${className}`,
    style,
    onPointerMove: onMove as (e: ReactPointerEvent<HTMLDivElement>) => void,
    children,
  };
  if (as === 'article') return <article {...props} />;
  if (as === 'section') return <section {...props} />;
  if (as === 'li') return <li {...(props as unknown as React.LiHTMLAttributes<HTMLLIElement> & { ref: React.Ref<HTMLLIElement> })} />;
  return <div {...props} />;
}

interface TiltProps {
  children: ReactNode;
  className?: string;
  /** Maximum tilt in degrees. */
  max?: number;
  style?: CSSProperties;
}

/** Perspective tilt that follows the pointer. */
export function Tilt({ children, className, max = 8, style }: TiltProps): React.ReactElement {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 200, damping: 20 });

  const onMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (reduce || e.pointerType === 'touch') return;
    const rect = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  };
  const reset = (): void => {
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <m.div
      className={className}
      style={{ ...style, rotateX: reduce ? 0 : rx, rotateY: reduce ? 0 : ry, transformPerspective: 1000, transformStyle: 'preserve-3d' }}
      onPointerMove={onMove}
      onPointerLeave={reset}
    >
      {children}
    </m.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Marquee & counter                                                          */
/* -------------------------------------------------------------------------- */

interface MarqueeProps {
  children: ReactNode;
  className?: string;
  /** Seconds for one full loop. */
  duration?: number;
  reverse?: boolean;
}

/** Infinite horizontal scroller; content is duplicated for a seamless loop. */
export function Marquee({ children, className = '', duration = 40, reverse }: MarqueeProps): React.ReactElement {
  return (
    <div
      className={`group relative flex overflow-hidden ${className}`}
      style={{
        maskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
        WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
      }}
    >
      <div
        className="animate-marquee flex w-max shrink-0 items-center gap-8 pr-8 group-hover:[animation-play-state:paused]"
        style={{ '--marquee-duration': `${duration}s`, animationDirection: reverse ? 'reverse' : 'normal' } as CSSProperties}
      >
        {children}
        <span aria-hidden className="contents">
          {children}
        </span>
      </div>
    </div>
  );
}

interface CounterProps {
  value: number;
  duration?: number;
  className?: string;
  suffix?: string;
  prefix?: string;
}

/** Counts up from zero the first time it scrolls into view. */
export function Counter({ value, duration = 1.4, className, suffix = '', prefix = '' }: CounterProps): React.ReactElement {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, duration, reduce]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {reduce ? value : display}
      {suffix}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Presence helpers                                                           */
/* -------------------------------------------------------------------------- */

interface FadeProps {
  children: ReactNode;
  show: boolean;
  className?: string;
}

/** Mount/unmount with a quick cross-fade and lift. */
export function Fade({ children, show, className }: FadeProps): React.ReactElement {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <m.div
          className={className}
          initial={{ opacity: 0, y: 6, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.99 }}
          transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}

export { m, AnimatePresence };
