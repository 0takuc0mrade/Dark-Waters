"use client"

export function RadarIllustration() {
  return (
    <div className="relative flex items-center justify-center" aria-hidden="true">
      <svg
        width="200"
        height="200"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-primary"
      >
        {/* Outer ring */}
        <circle
          cx="100"
          cy="100"
          r="90"
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth="1"
        />
        {/* Middle ring */}
        <circle
          cx="100"
          cy="100"
          r="60"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="1"
        />
        {/* Inner ring */}
        <circle
          cx="100"
          cy="100"
          r="30"
          stroke="currentColor"
          strokeOpacity="0.1"
          strokeWidth="1"
        />
        {/* Center dot */}
        <circle
          cx="100"
          cy="100"
          r="3"
          fill="currentColor"
          fillOpacity="0.5"
        />

        {/* Crosshair horizontal */}
        <line
          x1="10"
          y1="100"
          x2="190"
          y2="100"
          stroke="currentColor"
          strokeOpacity="0.06"
          strokeWidth="0.5"
        />
        {/* Crosshair vertical */}
        <line
          x1="100"
          y1="10"
          x2="100"
          y2="190"
          stroke="currentColor"
          strokeOpacity="0.06"
          strokeWidth="0.5"
        />

        {/* Sweep line group */}
        <g className="origin-center animate-radar-sweep" style={{ transformOrigin: "100px 100px" }}>
          {/* Sweep cone gradient */}
          <defs>
            <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="hsl(187, 70%, 48%)" stopOpacity="0" />
              <stop offset="100%" stopColor="hsl(187, 70%, 48%)" stopOpacity="0.25" />
            </linearGradient>
          </defs>
          {/* Sweep wedge */}
          <path
            d="M100 100 L100 10 A90 90 0 0 1 163.6 36.4 Z"
            fill="url(#sweepGrad)"
          />
          {/* Sweep leading line */}
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="10"
            stroke="currentColor"
            strokeOpacity="0.4"
            strokeWidth="1"
          />
        </g>

        {/* Blip 1 */}
        <circle
          cx="130"
          cy="55"
          r="2.5"
          fill="currentColor"
          fillOpacity="0.6"
          className="animate-radar-ping"
          style={{ animationDelay: "0s" }}
        />
        {/* Blip 2 */}
        <circle
          cx="65"
          cy="75"
          r="2"
          fill="currentColor"
          fillOpacity="0.4"
          className="animate-radar-ping"
          style={{ animationDelay: "0.8s" }}
        />
        {/* Blip 3 */}
        <circle
          cx="145"
          cy="120"
          r="2"
          fill="currentColor"
          fillOpacity="0.3"
          className="animate-radar-ping"
          style={{ animationDelay: "1.5s" }}
        />
      </svg>

      {/* Ambient glow behind the radar */}
      <div className="pointer-events-none absolute inset-0 rounded-full bg-primary/5 blur-3xl" />
    </div>
  )
}
