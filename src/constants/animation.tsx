import { TransitionVariants, RevealProps } from "@/types";

export const transitionVariants: TransitionVariants = {
  duration: 0.3,
  ease: 'easeInOut',
}

export const defaultRevealX: RevealProps = {
  initial: { x: 50, opacity: 0 },
  whileInView: { x: 0, opacity: 1 },
  viewport: { once: true },
  transition: transitionVariants,
}

export const defaultInitialRevealX: RevealProps = {
  initial: { x: 50, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  viewport: { once: true },
  transition: transitionVariants,
}

export const defaultRevealY: RevealProps = {
  initial: { y: 50, opacity: 0 },
  whileInView: { y: 0, opacity: 1 },
  viewport: { once: true },
  transition: transitionVariants,
}

export const defaultInitialRevealY: RevealProps = {
  initial: { y: 50, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  viewport: { once: true },
  transition: transitionVariants,
}
