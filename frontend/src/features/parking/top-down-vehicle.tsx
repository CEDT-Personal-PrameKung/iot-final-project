"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";
import type { VehicleType } from "@/types/parking";

interface TopDownVehicleProps {
  vehicleType?: VehicleType;
  className?: string;
}

export function TopDownVehicle({
  vehicleType = "car",
  className,
}: TopDownVehicleProps) {
  const uid = useId().replace(/:/g, "");
  const bodyGradId = `${uid}-body`;
  const roofGradId = `${uid}-roof`;
  const glassGradId = `${uid}-glass`;
  const shadowId = `${uid}-shadow`;

  if (vehicleType === "motorcycle") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 120 220"
        fill="none"
        className={cn("h-full w-auto select-none", className)}
      >
        <defs>
          <filter
            id={shadowId}
            x="-20%"
            y="-10%"
            width="140%"
            height="125%"
          >
            <feDropShadow
              dx="0"
              dy="4"
              stdDeviation="4.5"
              floodColor="#000000"
              floodOpacity="0.22"
            />
          </filter>
          <linearGradient id={bodyGradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d4d7dc" />
            <stop offset="30%" stopColor="#f8f9fa" />
            <stop offset="50%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#f3f4f6" />
            <stop offset="100%" stopColor="#c9cdd4" />
          </linearGradient>
        </defs>

        <g filter={`url(#${shadowId})`}>
          {/* Front & rear tires */}
          <rect x="52" y="28" width="16" height="36" rx="8" fill="#1f2329" />
          <rect x="50" y="156" width="20" height="38" rx="9" fill="#1f2329" />

          {/* Handlebars */}
          <path
            d="M32 66 C42 60, 78 60, 88 66"
            stroke="#2a2f37"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <rect x="27" y="63" width="9" height="5" rx="2.5" fill="#111317" />
          <rect x="84" y="63" width="9" height="5" rx="2.5" fill="#111317" />

          {/* Fairing & tank */}
          <path
            d="M46 52 C46 40, 74 40, 74 52 L78 96 C78 108, 72 114, 60 114 C48 114, 42 108, 42 96 Z"
            fill={`url(#${bodyGradId})`}
            stroke="#c6cad1"
            strokeWidth="1"
          />
          {/* Windscreen */}
          <path
            d="M49 56 C49 47, 71 47, 71 56 L68 72 L52 72 Z"
            fill="#191d24"
          />
          {/* Seat */}
          <path
            d="M46 112 C46 106, 74 106, 74 112 L72 158 C72 164, 48 164, 48 158 Z"
            fill="#23272f"
          />
          {/* Tail fairing */}
          <path
            d="M49 156 L71 156 L68 178 C66 184, 54 184, 52 178 Z"
            fill={`url(#${bodyGradId})`}
            stroke="#c6cad1"
            strokeWidth="1"
          />
          {/* Headlight & taillight */}
          <ellipse cx="60" cy="43" rx="6" ry="2.5" fill="#e5e7eb" />
          <rect x="54" y="177" width="12" height="4" rx="2" fill="#dc2626" />
        </g>
      </svg>
    );
  }

  const isSuv = vehicleType === "suv";
  const isTruck = vehicleType === "truck";

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 220"
      fill="none"
      className={cn("h-full w-auto select-none", className)}
    >
      <defs>
        <filter id={shadowId} x="-20%" y="-10%" width="140%" height="125%">
          <feDropShadow
            dx="0"
            dy="5"
            stdDeviation="5"
            floodColor="#000000"
            floodOpacity="0.22"
          />
        </filter>
        <linearGradient id={bodyGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#cfd3da" />
          <stop offset="16%" stopColor="#eef0f3" />
          <stop offset="50%" stopColor="#ffffff" />
          <stop offset="84%" stopColor="#eceef2" />
          <stop offset="100%" stopColor="#c7ccd4" />
        </linearGradient>
        <linearGradient id={roofGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#f3f4f6" />
          <stop offset="100%" stopColor="#e2e5ea" />
        </linearGradient>
        <linearGradient id={glassGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2c313a" />
          <stop offset="45%" stopColor="#12151a" />
          <stop offset="100%" stopColor="#262b34" />
        </linearGradient>
      </defs>

      <g filter={`url(#${shadowId})`}>
        {/* Side wing mirrors */}
        <path
          d="M23 73 L12 77 C10.5 77.5, 10.5 81.5, 12.5 82.5 L23 84 Z"
          fill="#e8eaee"
          stroke="#bfc4cc"
          strokeWidth="0.9"
        />
        <path
          d="M97 73 L108 77 C109.5 77.5, 109.5 81.5, 107.5 82.5 L97 84 Z"
          fill="#e8eaee"
          stroke="#bfc4cc"
          strokeWidth="0.9"
        />

        {/* Main outer vehicle body */}
        <path
          d={
            isSuv || isTruck
              ? "M24 38 C24 18, 38 11, 60 11 C82 11, 96 18, 96 38 L97 186 C97 201, 86 208, 60 208 C34 208, 23 201, 23 186 Z"
              : "M25 44 C26 20, 40 12, 60 12 C80 12, 94 20, 95 44 L96 178 C96 198, 84 208, 60 208 C36 208, 24 198, 24 178 Z"
          }
          fill={`url(#${bodyGradId})`}
          stroke="#c8cdd5"
          strokeWidth="1"
        />

        {/* Subtle front headlights */}
        <path
          d="M29 29 C32 21, 39 17, 45 16 C40 20, 35 25, 32 32 Z"
          fill="#ffffff"
          opacity="0.9"
        />
        <path
          d="M91 29 C88 21, 81 17, 75 16 C80 20, 85 25, 88 32 Z"
          fill="#ffffff"
          opacity="0.9"
        />

        {/* Hood sculpt lines */}
        <path
          d="M36 56 C38 40, 42 28, 46 21"
          stroke="#d2d6de"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M84 56 C82 40, 78 28, 74 21"
          stroke="#d2d6de"
          strokeWidth="1.2"
          strokeLinecap="round"
        />

        {/* Front windshield */}
        <path
          d="M30 72 C32 58, 42 54, 60 54 C78 54, 88 58, 90 72 L84 94 C77 91, 43 91, 36 94 Z"
          fill={`url(#${glassGradId})`}
        />
        {/* Subtle windshield sheen */}
        <path
          d="M36 69 C40 60, 50 57, 62 57 L54 78 L38 82 Z"
          fill="#ffffff"
          opacity="0.08"
        />

        {isTruck ? (
          <>
            {/* Truck cab side windows */}
            <path d="M28 79 L34 96 L34 126 L28 124 Z" fill="#181c22" />
            <path d="M92 79 L86 96 L86 126 L92 124 Z" fill="#181c22" />
            {/* Cab roof */}
            <rect
              x="34"
              y="91"
              width="52"
              height="36"
              rx="8"
              fill={`url(#${roofGradId})`}
              stroke="#d4d8df"
              strokeWidth="0.9"
            />
            {/* Rear cab glass */}
            <rect x="37" y="127" width="46" height="7" rx="3" fill="#181c22" />
            {/* Truck cargo bed */}
            <rect
              x="31"
              y="139"
              width="58"
              height="57"
              rx="6"
              fill="#2c313a"
              stroke="#c7ccd4"
              strokeWidth="1.5"
            />
            <line
              x1="44"
              y1="143"
              x2="44"
              y2="192"
              stroke="#3f4652"
              strokeWidth="1.5"
            />
            <line
              x1="60"
              y1="143"
              x2="60"
              y2="192"
              stroke="#3f4652"
              strokeWidth="1.5"
            />
            <line
              x1="76"
              y1="143"
              x2="76"
              y2="192"
              stroke="#3f4652"
              strokeWidth="1.5"
            />
          </>
        ) : (
          <>
            {/* Side windows (left & right) */}
            <path
              d={
                isSuv
                  ? "M28 78 L34 95 L34 176 L28 182 Z"
                  : "M29 78 L35 95 L35 162 L29 175 Z"
              }
              fill="#171b22"
            />
            <path
              d={
                isSuv
                  ? "M92 78 L86 95 L86 176 L92 182 Z"
                  : "M91 78 L85 95 L85 162 L91 175 Z"
              }
              fill="#171b22"
            />

            {/* B-pillar dividers on side glass */}
            <line
              x1="28"
              y1="126"
              x2="35"
              y2="126"
              stroke="#dce0e6"
              strokeWidth="2"
            />
            <line
              x1="85"
              y1="126"
              x2="92"
              y2="126"
              stroke="#dce0e6"
              strokeWidth="2"
            />

            {/* Cabin roof */}
            <path
              d={
                isSuv
                  ? "M36 92 C44 89, 76 89, 84 92 L85 174 C76 177, 44 177, 35 174 Z"
                  : "M36 92 C44 89, 76 89, 84 92 L82 162 C74 165, 46 165, 38 162 Z"
              }
              fill={`url(#${roofGradId})`}
              stroke="#d5d9e0"
              strokeWidth="0.9"
            />

            {/* SUV roof rails */}
            {isSuv && (
              <>
                <line
                  x1="39"
                  y1="100"
                  x2="39"
                  y2="168"
                  stroke="#aeb4be"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <line
                  x1="81"
                  y1="100"
                  x2="81"
                  y2="168"
                  stroke="#aeb4be"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </>
            )}

            {/* Roof shark-fin antenna */}
            <circle cx="60" cy="103" r="2.2" fill="#232830" />
            <line
              x1="60"
              y1="105"
              x2="60"
              y2="112"
              stroke="#232830"
              strokeWidth="1.4"
              strokeLinecap="round"
            />

            {/* Rear windshield */}
            <path
              d={
                isSuv
                  ? "M35 175 C44 178, 76 178, 85 175 L88 191 C78 195, 42 195, 32 191 Z"
                  : "M38 163 C46 166, 74 166, 82 163 L87 186 C78 192, 42 192, 33 186 Z"
              }
              fill={`url(#${glassGradId})`}
            />
          </>
        )}

        {/* Curved red rear taillights */}
        <path
          d="M28 193 C32 201, 40 205, 49 206 L47 202 C40 201, 34 198, 31 191 Z"
          fill="#c81e1e"
        />
        <path
          d="M92 193 C88 201, 80 205, 71 206 L73 202 C80 201, 86 198, 89 191 Z"
          fill="#c81e1e"
        />

        {/* Subtle rear bumper recess */}
        <path
          d="M49 205 C55 206.5, 65 206.5, 71 205"
          stroke="#adb3bd"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
