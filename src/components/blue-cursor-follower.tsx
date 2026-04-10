"use client";

import { useEffect, useRef, useState } from "react";

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
const INTRO_START_DELAY_MS = 650;
const INTRO_BUBBLE_HORIZONTAL_OFFSET_PX = 10;
const INTRO_BUBBLE_VERTICAL_OFFSET_PX = 18;
const INTRO_LABEL_FONT_SIZE_PX = 13;
const INTRO_LABEL_CHARACTER_DELAY_MIN_MS = 30;
const INTRO_LABEL_CHARACTER_DELAY_MAX_MS = 60;
const INTRO_SEQUENCE_HANDOFF_DELAY_MS = 1200;
const INTRO_TOUCH_DEVICE_HOLD_MS = 2200;
const CTA_CURSOR_HORIZONTAL_POSITION = 0.55;
const CTA_CURSOR_VERTICAL_OFFSET_PX = 10;

type CursorMode = "introNavigating" | "introPointing" | "followingMouse";

type Point = {
  x: number;
  y: number;
};

type BlueCursorFollowerProps = {
  introLabel: string;
  introTargetSelector: string;
};

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

export function BlueCursorFollower({
  introLabel,
  introTargetSelector,
}: BlueCursorFollowerProps) {
  const sceneElementRef = useRef<HTMLDivElement>(null);
  const cursorElementRef = useRef<HTMLDivElement>(null);
  const bubbleElementRef = useRef<HTMLDivElement>(null);
  const targetPosition = useRef<Point>({ x: -100, y: -100 });
  const cursorPosition = useRef<Point>({ x: -100, y: -100 });
  const cursorVelocity = useRef<Point>({ x: 0, y: 0 });
  const modeRef = useRef<CursorMode>("followingMouse");
  const isVisible = useRef(false);
  const hasReceivedMousePosition = useRef(false);
  const hasCancelledIntro = useRef(false);
  const introHasCompleted = useRef(false);
  const introStartTimeoutId = useRef<number | null>(null);
  const introCharacterTimeoutId = useRef<number | null>(null);
  const introHandoffTimeoutId = useRef<number | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const previousFrameTimestampMs = useRef<number | null>(null);
  const cursorRotationDegrees = useRef(DESKTOP_CURSOR_ROTATION_DEGREES);
  const cursorScale = useRef(1);
  const bubbleScale = useRef(0.5);
  const bubbleOpacity = useRef(0);
  const latestMouseTargetDuringIntro = useRef<Point | null>(null);
  const introFlight = useRef<{
    controlPoint: Point;
    durationMs: number;
    endPosition: Point;
    startPosition: Point;
    startedAtMs: number;
  } | null>(null);

  const [visibleBubbleText, setVisibleBubbleText] = useState("");

  useEffect(() => {
    const browserSupportsFinePointer =
      window.matchMedia("(pointer: fine)").matches &&
      window.matchMedia("(hover: hover)").matches;

    const sceneElement = sceneElementRef.current;
    const cursorElement = cursorElementRef.current;
    const bubbleElement = bubbleElementRef.current;

    if (!sceneElement || !cursorElement || !bubbleElement) {
      return;
    }

    const clearPendingIntroWork = () => {
      if (introStartTimeoutId.current !== null) {
        window.clearTimeout(introStartTimeoutId.current);
        introStartTimeoutId.current = null;
      }

      if (introCharacterTimeoutId.current !== null) {
        window.clearTimeout(introCharacterTimeoutId.current);
        introCharacterTimeoutId.current = null;
      }

      if (introHandoffTimeoutId.current !== null) {
        window.clearTimeout(introHandoffTimeoutId.current);
        introHandoffTimeoutId.current = null;
      }
    };

    const hideBubble = () => {
      bubbleOpacity.current = 0;
      bubbleScale.current = 0.96;
      setVisibleBubbleText("");
    };

    const renderScene = () => {
      sceneElement.style.transform = `translate3d(${cursorPosition.current.x}px, ${cursorPosition.current.y}px, 0)`;
      sceneElement.style.opacity = isVisible.current ? "1" : "0";

      cursorElement.style.transform = `translate3d(-50%, -50%, 0) rotate(${cursorRotationDegrees.current}deg) scale(${cursorScale.current})`;
      cursorElement.style.filter = `drop-shadow(0 0 ${DESKTOP_CURSOR_SHADOW_BLUR_PX + (cursorScale.current - 1) * 20}px ${DESKTOP_CURSOR_BLUE})`;

      bubbleElement.style.transform = `translate3d(${INTRO_BUBBLE_HORIZONTAL_OFFSET_PX}px, ${INTRO_BUBBLE_VERTICAL_OFFSET_PX}px, 0) scale(${bubbleScale.current})`;
      bubbleElement.style.opacity = `${bubbleOpacity.current}`;
      bubbleElement.style.boxShadow = `0 0 ${6 + (1 - bubbleScale.current) * 16}px rgba(51, 128, 255, ${0.5 + (1 - bubbleScale.current) * 0.45})`;
    };

    const finishIntroAndResumeFollowing = () => {
      introFlight.current = null;
      cursorScale.current = 1;
      cursorRotationDegrees.current = DESKTOP_CURSOR_ROTATION_DEGREES;
      modeRef.current = "followingMouse";
      introHasCompleted.current = true;
      renderScene();
    };

    const getCurrentIntroDestination = (): Point | null => {
      const introTargetElement = document.querySelector<HTMLElement>(
        introTargetSelector
      );

      if (!introTargetElement) {
        return null;
      }

      const targetBounds = introTargetElement.getBoundingClientRect();

      return {
        x:
          targetBounds.left +
          targetBounds.width * CTA_CURSOR_HORIZONTAL_POSITION,
        y: targetBounds.bottom - CTA_CURSOR_VERTICAL_OFFSET_PX,
      };
    };

    const handOffToRecordedMouseTarget = () => {
      const recordedMouseTarget = latestMouseTargetDuringIntro.current;

      if (!recordedMouseTarget) {
        return;
      }

      transitionToMouseFollowing({
        clientX: recordedMouseTarget.x - CURSOR_TRACKING_OFFSET_X,
        clientY: recordedMouseTarget.y - CURSOR_TRACKING_OFFSET_Y,
      } as MouseEvent);
    };

    const startIntroLabelStream = () => {
      modeRef.current = "introPointing";
      cursorScale.current = 1;
      cursorRotationDegrees.current = DESKTOP_CURSOR_ROTATION_DEGREES;
      bubbleOpacity.current = 1;
      bubbleScale.current = 0.5;
      setVisibleBubbleText("");
      renderScene();

      let nextCharacterIndex = 0;

      const streamNextCharacter = () => {
        if (hasCancelledIntro.current) {
          return;
        }

        if (nextCharacterIndex >= introLabel.length) {
          bubbleScale.current = 1;
          renderScene();

          introHandoffTimeoutId.current = window.setTimeout(() => {
            if (browserSupportsFinePointer) {
              introHasCompleted.current = true;
              handOffToRecordedMouseTarget();
              return;
            }

            bubbleOpacity.current = 0;
            isVisible.current = false;
            introHasCompleted.current = true;
            renderScene();
          }, browserSupportsFinePointer ? INTRO_SEQUENCE_HANDOFF_DELAY_MS : INTRO_TOUCH_DEVICE_HOLD_MS);
          return;
        }

        nextCharacterIndex += 1;
        setVisibleBubbleText(introLabel.slice(0, nextCharacterIndex));

        if (nextCharacterIndex === 1) {
          bubbleScale.current = 1;
        }

        renderScene();

        const nextCharacterDelayMs =
          INTRO_LABEL_CHARACTER_DELAY_MIN_MS +
          Math.random() *
            (INTRO_LABEL_CHARACTER_DELAY_MAX_MS -
              INTRO_LABEL_CHARACTER_DELAY_MIN_MS);

        introCharacterTimeoutId.current = window.setTimeout(
          streamNextCharacter,
          nextCharacterDelayMs
        );
      };

      streamNextCharacter();
    };

    const beginDesktopStyleIntroFlight = () => {
      const introDestination = getCurrentIntroDestination();
      if (!introDestination) {
        introHasCompleted.current = true;
        return;
      }

      const introStartPosition = {
        x: Math.max(48, introDestination.x - Math.min(340, window.innerWidth * 0.28)),
        y: Math.max(72, introDestination.y - 170),
      };

      cursorPosition.current = introStartPosition;
      targetPosition.current = introDestination;
      cursorVelocity.current = { x: 0, y: 0 };
      cursorRotationDegrees.current = DESKTOP_CURSOR_ROTATION_DEGREES;
      cursorScale.current = 1;
      isVisible.current = true;
      modeRef.current = "introNavigating";

      const travelDistance = Math.hypot(
        introDestination.x - introStartPosition.x,
        introDestination.y - introStartPosition.y
      );
      const flightDurationMs = Math.min(
        Math.max((travelDistance / 800) * 1000, 600),
        1400
      );
      const arcHeight = Math.min(travelDistance * 0.2, 80);
      const controlPoint = {
        x: (introStartPosition.x + introDestination.x) / 2,
        y:
          (introStartPosition.y + introDestination.y) / 2 -
          arcHeight,
      };

      introFlight.current = {
        controlPoint,
        durationMs: flightDurationMs,
        endPosition: introDestination,
        startPosition: introStartPosition,
        startedAtMs: performance.now(),
      };

      renderScene();
    };

    const refreshIntroTargetDuringViewportChanges = () => {
      const introDestination = getCurrentIntroDestination();

      if (!introDestination) {
        return;
      }

      targetPosition.current = introDestination;

      if (modeRef.current === "introPointing") {
        cursorPosition.current = introDestination;
        cursorRotationDegrees.current = DESKTOP_CURSOR_ROTATION_DEGREES;
        cursorScale.current = 1;
        renderScene();
        return;
      }

      if (modeRef.current !== "introNavigating" || !introFlight.current) {
        return;
      }

      const currentCursorPosition = { ...cursorPosition.current };
      const remainingDistance = Math.hypot(
        introDestination.x - currentCursorPosition.x,
        introDestination.y - currentCursorPosition.y
      );
      const updatedArcHeight = Math.min(remainingDistance * 0.2, 80);

      introFlight.current = {
        controlPoint: {
          x: (currentCursorPosition.x + introDestination.x) / 2,
          y:
            (currentCursorPosition.y + introDestination.y) / 2 -
            updatedArcHeight,
        },
        durationMs: Math.min(
          Math.max((remainingDistance / 800) * 1000, 320),
          900
        ),
        endPosition: introDestination,
        startPosition: currentCursorPosition,
        startedAtMs: performance.now(),
      };

      renderScene();
    };

    const transitionToMouseFollowing = (
      event?: MouseEvent
    ) => {
      if (!introHasCompleted.current) {
        hasCancelledIntro.current = true;
      }

      clearPendingIntroWork();
      hideBubble();
      finishIntroAndResumeFollowing();

      if (!event) {
        return;
      }

      const nextMouseTargetPosition = {
        x: event.clientX + CURSOR_TRACKING_OFFSET_X,
        y: event.clientY + CURSOR_TRACKING_OFFSET_Y,
      };

      hasReceivedMousePosition.current = true;
      targetPosition.current = nextMouseTargetPosition;
      isVisible.current = true;
      renderScene();
    };

    const handleMouseMove = (event: MouseEvent) => {
      const nextMouseTargetPosition = {
        x: event.clientX + CURSOR_TRACKING_OFFSET_X,
        y: event.clientY + CURSOR_TRACKING_OFFSET_Y,
      };

      if (!introHasCompleted.current && browserSupportsFinePointer) {
        latestMouseTargetDuringIntro.current = nextMouseTargetPosition;
        return;
      }

      if (modeRef.current === "introPointing") {
        transitionToMouseFollowing(event);
        return;
      }

      targetPosition.current = nextMouseTargetPosition;
      hasReceivedMousePosition.current = true;
      isVisible.current = true;
      renderScene();
    };

    const handleViewportChange = () => {
      if (!introHasCompleted.current || modeRef.current === "introPointing") {
        refreshIntroTargetDuringViewportChanges();
      }
    };

    const hideCursor = () => {
      isVisible.current = false;
      renderScene();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        hideCursor();
      }
    };

    const animateDesktopFlight = (timestampMs: number) => {
      const activeFlight = introFlight.current;
      if (!activeFlight) {
        return;
      }

      const linearProgress = Math.min(
        (timestampMs - activeFlight.startedAtMs) / activeFlight.durationMs,
        1
      );
      const easedProgress =
        linearProgress * linearProgress * (3 - 2 * linearProgress);
      const oneMinusProgress = 1 - easedProgress;

      const bezierX =
        oneMinusProgress * oneMinusProgress * activeFlight.startPosition.x +
        2 *
          oneMinusProgress *
          easedProgress *
          activeFlight.controlPoint.x +
        easedProgress * easedProgress * activeFlight.endPosition.x;
      const bezierY =
        oneMinusProgress * oneMinusProgress * activeFlight.startPosition.y +
        2 *
          oneMinusProgress *
          easedProgress *
          activeFlight.controlPoint.y +
        easedProgress * easedProgress * activeFlight.endPosition.y;

      cursorPosition.current = { x: bezierX, y: bezierY };

      const tangentX =
        2 *
          oneMinusProgress *
          (activeFlight.controlPoint.x - activeFlight.startPosition.x) +
        2 * easedProgress * (activeFlight.endPosition.x - activeFlight.controlPoint.x);
      const tangentY =
        2 *
          oneMinusProgress *
          (activeFlight.controlPoint.y - activeFlight.startPosition.y) +
        2 * easedProgress * (activeFlight.endPosition.y - activeFlight.controlPoint.y);

      cursorRotationDegrees.current =
        (Math.atan2(tangentY, tangentX) * 180) / Math.PI + 90;
      cursorScale.current = 1 + Math.sin(linearProgress * Math.PI) * 0.3;

      if (linearProgress >= 1) {
        cursorPosition.current = activeFlight.endPosition;
        cursorRotationDegrees.current = DESKTOP_CURSOR_ROTATION_DEGREES;
        cursorScale.current = 1;
        introFlight.current = null;
        startIntroLabelStream();
      }
    };

    const animateSpringFollowing = (timestampMs: number) => {
      const previousTimestampMs =
        previousFrameTimestampMs.current ?? timestampMs;
      const frameDeltaSeconds = Math.min(
        (timestampMs - previousTimestampMs) / 1000,
        MAX_FRAME_DELTA_SECONDS
      );

      previousFrameTimestampMs.current = timestampMs;

      if (!hasReceivedMousePosition.current) {
        return;
      }

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
      cursorPosition.current.x += cursorVelocity.current.x * frameDeltaSeconds;
      cursorPosition.current.y += cursorVelocity.current.y * frameDeltaSeconds;

      const remainingDistanceX = Math.abs(
        targetPosition.current.x - cursorPosition.current.x
      );
      const remainingDistanceY = Math.abs(
        targetPosition.current.y - cursorPosition.current.y
      );
      const remainingVelocityX = Math.abs(cursorVelocity.current.x);
      const remainingVelocityY = Math.abs(cursorVelocity.current.y);

      if (
        remainingDistanceX < REST_DISTANCE_THRESHOLD_PX &&
        remainingDistanceY < REST_DISTANCE_THRESHOLD_PX &&
        remainingVelocityX < REST_VELOCITY_THRESHOLD &&
        remainingVelocityY < REST_VELOCITY_THRESHOLD
      ) {
        cursorPosition.current = { ...targetPosition.current };
        cursorVelocity.current = { x: 0, y: 0 };
      }

      cursorRotationDegrees.current = DESKTOP_CURSOR_ROTATION_DEGREES;
      cursorScale.current = 1;
    };

    const animationLoop = (timestampMs: number) => {
      if (modeRef.current === "introNavigating") {
        animateDesktopFlight(timestampMs);
      } else if (modeRef.current === "followingMouse") {
        animateSpringFollowing(timestampMs);
      }

      renderScene();
      animationFrameId.current = window.requestAnimationFrame(animationLoop);
    };

    introStartTimeoutId.current = window.setTimeout(() => {
      if (
        (browserSupportsFinePointer && hasReceivedMousePosition.current) ||
        hasCancelledIntro.current
      ) {
        introHasCompleted.current = true;
        return;
      }

      beginDesktopStyleIntroFlight();
    }, INTRO_START_DELAY_MS);

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("scroll", handleViewportChange, {
      passive: true,
    });
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("blur", hideCursor);
    document.documentElement.addEventListener("mouseleave", hideCursor);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    animationFrameId.current = window.requestAnimationFrame(animationLoop);

    return () => {
      clearPendingIntroWork();
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("scroll", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("blur", hideCursor);
      document.documentElement.removeEventListener("mouseleave", hideCursor);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (animationFrameId.current !== null) {
        window.cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [introLabel, introTargetSelector]);

  return (
    <div
      ref={sceneElementRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 9999,
        opacity: 0,
        willChange: "transform, opacity",
        transition: "opacity 180ms ease-out",
      }}
    >
      <div
        ref={cursorElementRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${DESKTOP_CURSOR_SIZE_PX}px`,
          height: `${DESKTOP_CURSOR_SIZE_PX}px`,
          transformOrigin: "50% 50%",
          willChange: "transform, filter",
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

      <div
        ref={bubbleElementRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          padding: "0.65rem 0.95rem",
          borderRadius: "0.95rem",
          background: DESKTOP_CURSOR_BLUE,
          color: "#ffffff",
          fontFamily: "var(--font-display), sans-serif",
          fontSize: `${INTRO_LABEL_FONT_SIZE_PX}px`,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          whiteSpace: "nowrap",
          opacity: 0,
          transformOrigin: "top left",
          willChange: "transform, opacity, box-shadow",
        }}
      >
        {visibleBubbleText}
      </div>
    </div>
  );
}
