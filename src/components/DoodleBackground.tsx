import React from 'react';

interface DoodleBackgroundProps {
  className?: string;
  opacity?: number;
  color?: string;
}

export function DoodleBackground({ 
  className = '', 
  opacity = 0.06, 
  color = '#1c4a59' 
}: DoodleBackgroundProps) {
  return (
    <div 
      className={`absolute inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}
      aria-hidden="true"
    >
      <svg
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        style={{ opacity }}
      >
        <defs>
          <pattern
            id="academic-doodles-pattern"
            width="320"
            height="320"
            patternUnits="userSpaceOnUse"
          >
            {/* 1. Open Book Doodle */}
            <path
              d="M 25 35 C 35 32, 50 32, 60 38 C 70 32, 85 32, 95 35 L 95 65 C 85 62, 70 62, 60 68 C 50 62, 35 62, 25 65 Z M 60 38 L 60 68"
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Book pages lines */}
            <path
              d="M 33 46 C 40 44, 48 44, 53 47 M 33 53 C 40 51, 48 51, 53 54 M 67 47 C 73 44, 80 44, 87 46 M 67 54 C 73 51, 80 51, 87 53"
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
            />

            {/* 2. Graduation Cap Doodle */}
            <path
              d="M 170 35 L 210 20 L 250 35 L 210 50 Z M 210 50 L 210 65 C 210 70, 185 70, 185 65 L 185 41"
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Cap tassel */}
            <path
              d="M 240 33 L 246 48 L 244 58 C 248 58, 248 54, 246 48"
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
            />

            {/* 3. Pencil Doodle */}
            <path
              d="M 130 95 L 155 70 L 165 80 L 140 105 L 126 109 Z M 130 95 L 140 105 M 150 75 L 160 85 M 126 109 L 132 103"
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* 4. Lightbulb Doodle (Idea) */}
            <path
              d="M 45 130 C 35 130, 30 140, 35 150 C 38 156, 42 160, 42 166 L 54 166 C 54 160, 58 156, 61 150 C 66 140, 61 130, 48 130 Z M 43 170 L 53 170 M 45 174 L 51 174"
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Bulb rays */}
            <path
              d="M 48 122 L 48 126 M 26 138 L 30 140 M 66 140 L 70 138"
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
            />

            {/* 5. Ruler Doodle */}
            <path
              d="M 230 110 L 290 145 L 280 162 L 220 127 Z M 238 120 L 244 130 M 248 126 L 252 133 M 258 132 L 264 142 M 268 138 L 272 145 M 278 144 L 284 154"
              fill="none"
              stroke={color}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* 6. Clock / Stopwatch Doodle */}
            <circle
              cx="140"
              cy="165"
              r="18"
              fill="none"
              stroke={color}
              strokeWidth="2"
            />
            <path
              d="M 140 153 L 140 165 L 148 165 M 136 143 L 144 143 M 140 143 L 140 147"
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* 7. Paper Airplane Doodle */}
            <path
              d="M 30 230 L 80 205 L 55 250 L 50 232 Z M 80 205 L 50 232"
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Wind trail */}
            <path
              d="M 20 240 C 26 238, 30 242, 34 238"
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="2 3"
            />

            {/* 8. Chemistry Flask Doodle */}
            <path
              d="M 225 210 L 235 210 L 235 225 L 250 252 C 253 258, 248 262, 240 262 L 220 262 C 212 262, 207 258, 210 252 L 225 225 Z M 216 248 L 244 248"
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Bubbles */}
            <circle cx="225" cy="254" r="1.5" fill={color} />
            <circle cx="233" cy="252" r="2" fill={color} />

            {/* 9. Compass / Geometry Divider Doodle */}
            <path
              d="M 125 255 L 140 220 L 155 255 M 130 244 L 150 244 M 140 216 L 140 220"
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* 10. Star / Asterisk Doodles */}
            <path
              d="M 95 115 L 97 122 L 104 124 L 97 126 L 95 133 L 93 126 L 86 124 L 93 122 Z"
              fill={color}
              opacity="0.7"
            />
            <path
              d="M 275 60 L 276 64 L 280 65 L 276 66 L 275 70 L 274 66 L 270 65 L 274 64 Z"
              fill={color}
              opacity="0.7"
            />
            <path
              d="M 180 120 L 180 130 M 175 125 L 185 125 M 176 121 L 184 129 M 176 129 L 184 121"
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
            />

            {/* 11. Math Symbols & Scribbles */}
            {/* Pi symbol */}
            <path
              d="M 270 210 L 290 210 M 275 210 L 274 225 M 285 210 L 286 225"
              fill="none"
              stroke={color}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            {/* Square root check */}
            <path
              d="M 105 180 L 109 186 L 115 174 L 126 174"
              fill="none"
              stroke={color}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Plus and Equals */}
            <path
              d="M 85 75 L 85 83 M 81 79 L 89 79"
              fill="none"
              stroke={color}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M 185 175 L 195 175 M 185 179 L 195 179"
              fill="none"
              stroke={color}
              strokeWidth="1.8"
              strokeLinecap="round"
            />

            {/* 12. Hand-drawn Curly Arrow Doodle */}
            <path
              d="M 95 270 C 80 285, 105 300, 120 285 C 128 275, 110 265, 105 280 L 108 285"
              fill="none"
              stroke={color}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M 102 284 L 108 285 L 109 279"
              fill="none"
              stroke={color}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* 13. Scribble / Underline Loop */}
            <path
              d="M 195 285 C 205 283, 215 287, 225 283 C 235 280, 245 286, 255 283"
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#academic-doodles-pattern)" />
      </svg>
    </div>
  );
}
