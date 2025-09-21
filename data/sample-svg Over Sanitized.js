// Sample SVG Data - make available globally for ES6 modules
const SAMPLE_SVG = `<?xml version="1.0"?>
<svg width="261" height="350" xmlns="http://www.w3.org/2000/svg" version="1.1">
 <polygon points="4,346 4,4 258,4 258,346 4,346" stroke-opacity="0.000000" stroke="#fffffe" fill-opacity="0.000000" fill="#fffffe"/>
 <polygon points="254,4 131,4 131,26 254,26 254,4" stroke="#90c4e4" fill="none"/>
 <text x="139" y="16" fill="#000000" font-family="Arial" font-size="9">SortingFramework ▷</text>
 <polygon points="55,164 4,164 4,186 55,186 55,164" stroke="#1976d2" stroke-width="3" fill="none"/>
 <text x="13" y="176" fill="#000000" font-family="Arial" font-size="9">main ▶</text>
 <path d="M 36 163 C 48 136, 80 70, 127 35 C 130 33, 134 31, 138 29" stroke="#4e8cb9" fill="none"/>
 <polygon points="136,27 141,26 138,30 136,27" stroke="#4e8cb9" fill="#4e8cb9"/>
 <polygon points="215,44 170,44 170,66 215,66 215,44" stroke="#90c4e4" fill="none"/>
 <text x="178" y="56" fill="#000000" font-family="Arial" font-size="9">sort ▷</text>
 <path d="M 39 163 C 55 142, 89 99, 127 75 C 138 68, 152 63, 164 60" stroke="#4e8cb9" fill="none"/>
 <polygon points="163,58 169,59 164,62 163,58" stroke="#4e8cb9" fill="#4e8cb9"/>
 <polygon points="258,84 127,84 127,106 258,106 258,84" stroke="#8f8f8f" fill="none"/>
 <text x="135" y="96" fill="#000000" font-family="Arial" font-size="9">~SortingFramework ▷</text>
 <path d="M 48 163 C 66 149, 98 128, 127 115 C 133 113, 138 110, 144 108" stroke="#4e8cb9" fill="none"/>
 <polygon points="143,106 148,106 144,110 143,106" stroke="#4e8cb9" fill="#4e8cb9"/>
 <polygon points="231,124 153,124 153,146 231,146 231,124" stroke="#8f8f8f" fill="none"/>
 <text x="161" y="136" fill="#000000" font-family="Arial" font-size="9">operator&lt;&lt; </text>
 <path d="M 56 169 C 81 162, 118 153, 147 146" stroke="#4e8cb9" fill="none"/>
 <polygon points="147,144 152,145 148,147 147,144" stroke="#4e8cb9" fill="#4e8cb9"/>
 <polygon points="234,164 151,164 151,186 234,186 234,164" stroke="#8f8f8f" fill="none"/>
 <text x="159" y="176" fill="#000000" font-family="Arial" font-size="9">basic_string </text>
 <path d="M 56 175 C 80 175, 116 175, 145 175" stroke="#4e8cb9" fill="none"/>
 <polygon points="144,173 149,175 144,177 144,173" stroke="#4e8cb9" fill="#4e8cb9"/>
 <polygon points="213,204 171,204 171,226 213,226 213,204" stroke="#8f8f8f" fill="none"/>
 <text x="179" y="216" fill="#000000" font-family="Arial" font-size="9">endl </text>
 <path d="M 56 181 C 86 189, 136 201, 166 209" stroke="#4e8cb9" fill="none"/>
 <polygon points="166,207 170,210 165,210 166,207" stroke="#4e8cb9" fill="#4e8cb9"/>
 <polygon points="231,244 153,244 153,266 231,266 231,244" stroke="#8f8f8f" fill="none"/>
 <text x="161" y="256" fill="#000000" font-family="Arial" font-size="9">operator&lt;&lt; </text>
 <path d="M 48 187 C 66 201, 98 222, 127 235 C 134 238, 141 241, 148 243" stroke="#4e8cb9" fill="none"/>
 <polygon points="148,242 152,245 147,245 148,242" stroke="#4e8cb9" fill="#4e8cb9"/>
 <polygon points="218,284 166,284 166,306 218,306 218,284" stroke="#8f8f8f" fill="none"/>
 <text x="174" y="296" fill="#000000" font-family="Arial" font-size="9">vector </text>
 <path d="M 39 187 C 55 208, 89 251, 127 275 C 137 281, 150 286, 161 289" stroke="#4e8cb9" fill="none"/>
 <polygon points="161,287 165,290 160,291 161,287" stroke="#4e8cb9" fill="#4e8cb9"/>
 <polygon points="222,324 163,324 163,346 222,346 222,324" stroke="#8f8f8f" fill="none"/>
 <text x="171" y="336" fill="#000000" font-family="Arial" font-size="9">~vector </text>
 <path d="M 36 187 C 48 214, 80 280, 127 315 C 136 321, 147 326, 157 329" stroke="#4e8cb9" fill="none"/>
 <polygon points="157,327 162,330 156,331 157,327" stroke="#4e8cb9" fill="#4e8cb9"/>
</svg>`;

// Also make it available on window for ES6 modules
window.SAMPLE_SVG = SAMPLE_SVG;

// Default SVG URL (placeholder)
const DEFAULT_SVG_URL = "diagram.svg";
window.DEFAULT_SVG_URL = DEFAULT_SVG_URL;