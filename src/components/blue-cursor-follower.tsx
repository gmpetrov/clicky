"use client";

import { useEffect, useRef } from "react";

const DESKTOP_CURSOR_BLUE = "#3380FF";
const DESKTOP_CURSOR_SIZE_PX = 16;
const DESKTOP_CURSOR_ROTATION_DEGREES = -35;
const DESKTOP_CURSOR_SHADOW_BLUR_PX = 8;
const CURSOR_TRACKING_OFFSET_X = 35;
const CURSOR_TRACKING_OFFSET_Y = 25;
const SPRING_RESPONSE_SECONDS = 0.2;
const SPRING_DAMPING_FRACTION = 0.6;
const MAX_FRAME_DELTA_SECONDS = 1 / 24;
const REST_DISTANCE_THRESHOLD_PX = 0.01;
const REST_VELOCITY_THRESHOLD = 0.01;

const SPRING_ANGULAR_FREQUENCY =
  (2 * Math.PI) / SPRING_RESPONSE_SECONDS;
const SPRING_STIFFNESS = SPRING_ANGULAR_FREQUENCY ** 2;
const SPRING_DAMPING =
  2 * SPRING_DAMPING_FRACTION * SPRING_ANGULAR_FREQUENCY;

const triangleHeight =
  DESKTOP_CURSOR_SIZE_PX * (Math.sqrt(3) / 2);
const triangleTopY =
  DESKTOP_CURSOR_SIZE_PX / 2 - triangleHeight / 1.5;
const triangleBottomY =
  DESKTOP_CURSOR_SIZE_PX / 2 + triangleHeight / 3;
const trianglePath = `M ${DESKTOP_CURSOR_SIZE_PX / 2} ${triangleTopY} L 0 ${triangleBottomY} L ${DESKTOP_CURSOR_SIZE_PX} ${triangleBottomY} Z`;

export function BlueCursorFollower() {
  const cursorElementRef = useRef<HTMLDivElement>(null);
  const targetPosition = useRef({ x: -100, y: -100 });
  const cursorPosition = useRef({ x: -100, y: -100 });
  const cursorVelocity = useRef({ x: 0, y: 0 });
  const hasReceivedMousePosition = useRef(false);
  const isVisible = useRef(false);
  const animationFrameId = useRef<number | null>(null);
  const previousFrameTimestampMs = useRef<number | null>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) {
      return;
    }

    const cursorElement = cursorElementRef.current;
    if (!cursorElement) {
      return;
    }

    const renderCursor = () => {
      const cursorLeft =
        cursorPosition.current.x - DESKTOP_CURSOR_SIZE_PX / 2;
      const cursorTop =
        cursorPosition.current.y - DESKTOP_CURSOR_SIZE_PX / 2;

      cursorElement.style.transform = `translate3d(${cursorLeft}px, ${cursorTop}px, 0) rotate(${DESKTOP_CURSOR_ROTATION_DEGREES}deg)`;
      cursorElement.style.opacity = isVisible.current ? "1" : "0";
    };

    const handleMouseMove = (event: MouseEvent) => {
      const nextTargetPosition = {
        x: event.clientX + CURSOR_TRACKING_OFFSET_X,
        y: event.clientY + CURSOR_TRACKING_OFFSET_Y,
      };

      targetPosition.current = nextTargetPosition;
      isVisible.current = true;

      if (!hasReceivedMousePosition.current) {
        hasReceivedMousePosition.current = true;
        cursorPosition.current = nextTargetPosition;
        cursorVelocity.current = { x: 0, y: 0 };
      }

      renderCursor();
    };

    const hideCursor = () => {
      isVisible.current = false;
      renderCursor();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        hideCursor();
      }
    };

    const animateCursor = (timestampMs: number) => {
      const previousTimestampMs =
        previousFrameTimestampMs.current ?? timestampMs;
      const frameDeltaSeconds = Math.min(
        (timestampMs - previousTimestampMs) / 1000,
        MAX_FRAME_DELTA_SECONDS
      );

      previousFrameTimestampMs.current = timestampMs;

      if (hasReceivedMousePosition.current) {
        const targetDeltaX =
          targetPosition.current.x - cursorPosition.current.x;
        const targetDeltaY =
          targetPosition.current.y - cursorPosition.current.y;

        const accelerationX =
          SPRING_STIFFNESS * targetDeltaX -
          SPRING_DAMPING * cursorVelocity.current.x;
        const accelerationY =
          SPRING_STIFFNESS * targetDeltaY -
          SPRING_DAMPING * cursorVelocity.current.y;

        cursorVelocity.current.x += accelerationX * frameDeltaSeconds;
        cursorVelocity.current.y += accelerationY * frameDeltaSeconds;
        cursorPosition.current.x +=
          cursorVelocity.current.x * frameDeltaSeconds;
        cursorPosition.current.y +=
          cursorVelocity.current.y * frameDeltaSeconds;

        const remainingDistanceX = Math.abs(
          targetPosition.current.x - cursorPosition.current.x
        );
        const remainingDistanceY = Math.abs(
          targetPosition.current.y - cursorPosition.current.y
        );
        const remainingVelocityX = Math.abs(cursorVelocity.current.x);
        const remainingVelocityY = Math.abs(cursorVelocity.current.y);

        const hasSettledIntoRestPosition =
          remainingDistanceX < REST_DISTANCE_THRESHOLD_PX &&
          remainingDistanceY < REST_DISTANCE_THRESHOLD_PX &&
          remainingVelocityX < REST_VELOCITY_THRESHOLD &&
          remainingVelocityY < REST_VELOCITY_THRESHOLD;

        if (hasSettledIntoRestPosition) {
          cursorPosition.current = { ...targetPosition.current };
          cursorVelocity.current = { x: 0, y: 0 };
        }
      }

      renderCursor();
      animationFrameId.current = window.requestAnimationFrame(animateCursor);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", hideCursor);
    window.addEventListener("blur", hideCursor);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    animationFrameId.current = window.requestAnimationFrame(animateCursor);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.documentElement.removeEventListener("mouseleave", hideCursor);
      window.removeEventListener("blur", hideCursor);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (animationFrameId.current !== null) {
        window.cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  return (
    <div
      ref={cursorElementRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: `${DESKTOP_CURSOR_SIZE_PX}px`,
        height: `${DESKTOP_CURSOR_SIZE_PX}px`,
        pointerEvents: "none",
        zIndex: 9999,
        opacity: 0,
        willChange: "transform, opacity",
        transition: "opacity 180ms ease-out",
        filter: `drop-shadow(0 0 ${DESKTOP_CURSOR_SHADOW_BLUR_PX}px ${DESKTOP_CURSOR_BLUE})`,
        transformOrigin: "50% 50%",
      }}
    >
      <svg
        width={DESKTOP_CURSOR_SIZE_PX}
        height={DESKTOP_CURSOR_SIZE_PX}
        viewBox={`0 0 ${DESKTOP_CURSOR_SIZE_PX} ${DESKTOP_CURSOR_SIZE_PX}`}
        style={{ display: "block", overflow: "visible" }}
      >
        <path d={trianglePath} fill={DESKTOP_CURSOR_BLUE} />
      </svg>
    </div>
  );
}
