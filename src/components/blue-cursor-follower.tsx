"use client";

import { useEffect, useRef } from "react";

const CURSOR_BLUE = "#3380FF";
const SPRING_RESPONSE = 0.2;
const SPRING_DAMPING = 0.6;

export function BlueCursorFollower() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mousePosition = useRef({ x: -100, y: -100 });
  const cursorPosition = useRef({ x: -100, y: -100 });
  const cursorVelocity = useRef({ x: 0, y: 0 });
  const isVisible = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();

    const handleMouseMove = (event: MouseEvent) => {
      mousePosition.current = { x: event.clientX, y: event.clientY };
      isVisible.current = true;
    };

    const handleMouseLeave = () => {
      isVisible.current = false;
    };

    const drawTriangle = (x: number, y: number, rotationRadians: number) => {
      const size = 16;
      const height = size * (Math.sqrt(3) / 2);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotationRadians);

      ctx.shadowColor = CURSOR_BLUE;
      ctx.shadowBlur = 20;

      ctx.beginPath();
      ctx.moveTo(0, -height * 0.67);
      ctx.lineTo(-size / 2, height * 0.33);
      ctx.lineTo(size / 2, height * 0.33);
      ctx.closePath();

      ctx.fillStyle = CURSOR_BLUE;
      ctx.fill();

      ctx.shadowBlur = 10;
      ctx.fill();

      ctx.shadowBlur = 0;

      const innerInset = 3;
      const innerSize = size - innerInset * 1.5;
      const innerHeight = innerSize * (Math.sqrt(3) / 2);

      ctx.beginPath();
      ctx.moveTo(0, -innerHeight * 0.67 + 1);
      ctx.lineTo(-innerSize / 2 + 0.5, innerHeight * 0.33 - 0.5);
      ctx.lineTo(innerSize / 2 - 0.5, innerHeight * 0.33 - 0.5);
      ctx.closePath();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
    };

    const animate = () => {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const targetX = mousePosition.current.x + 28;
      const targetY = mousePosition.current.y + 20;

      const stiffness = (2 * Math.PI / SPRING_RESPONSE) ** 2;
      const damping = 2 * SPRING_DAMPING * Math.sqrt(stiffness);
      const dt = 1 / 60;

      const forceX = stiffness * (targetX - cursorPosition.current.x);
      const forceY = stiffness * (targetY - cursorPosition.current.y);
      const dampX = damping * cursorVelocity.current.x;
      const dampY = damping * cursorVelocity.current.y;

      cursorVelocity.current.x += (forceX - dampX) * dt;
      cursorVelocity.current.y += (forceY - dampY) * dt;
      cursorPosition.current.x += cursorVelocity.current.x * dt;
      cursorPosition.current.y += cursorVelocity.current.y * dt;

      if (isVisible.current) {
        drawTriangle(
          cursorPosition.current.x,
          cursorPosition.current.y,
          -35 * (Math.PI / 180)
        );
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", handleMouseMove);
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", handleResize);
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.documentElement.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    />
  );
}
