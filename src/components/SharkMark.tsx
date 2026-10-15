/** The belly-up shark in its broken sonar ring — inlined so it can animate. */
export function SharkMark({ size = 96, ping = false }: { size?: number; ping?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 400 400"
      aria-hidden="true"
      className={ping ? 'mark mark-ping' : 'mark'}
    >
      <defs>
        <linearGradient id="lineage" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7B68C8" />
          <stop offset="1" stopColor="#3FE0C5" />
        </linearGradient>
        <linearGradient id="sharkfill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A9BCCD" />
          <stop offset="1" stopColor="#6E8299" />
        </linearGradient>
      </defs>
      <g transform="translate(200,203) scale(1.02) translate(-200,-205)">
        <circle
          className="mark-ring"
          cx="200"
          cy="205"
          r="168"
          fill="none"
          stroke="url(#lineage)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray="700 120"
          strokeDashoffset="-160"
          opacity=".92"
        />
        <g transform="rotate(-4 200 210)">
          <path
            fill="url(#sharkfill)"
            d="M 336 196 C 306 172 262 158 216 162 C 210 148 200 136 184 130
               C 188 144 188 156 184 166 C 148 172 116 184 92 198 C 76 184 60 162 56 138
               C 44 164 44 196 56 218 C 48 238 46 260 52 280 C 62 264 74 250 90 240
               C 114 252 146 258 180 258 C 176 272 176 286 182 300 C 192 292 200 280 204 266
               C 206 260 208 258 214 258 C 262 254 306 236 336 210 C 340 206 340 200 336 196 Z"
          />
          <g stroke="#060B12" strokeWidth="8" strokeLinecap="round">
            <path d="M 283 208 L 301 226" />
            <path d="M 301 208 L 283 226" />
          </g>
        </g>
        <g fill="none" stroke="#3FE0C5" strokeWidth="5">
          <circle cx="196" cy="128" r="7" />
          <circle cx="218" cy="118" r="5" />
        </g>
      </g>
    </svg>
  );
}
