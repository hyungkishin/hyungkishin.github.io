## Rules of Engagement

### 1. The "1:1:1" Writing Principle
- **One Sentence, One Info:** Never pack two distinct technical facts into one sentence.
- **Direct Voice:** Avoid passive voice. Instead of "It is observed that...", use "We observed...".
- **Kill the Fluff:** Remove conjunctions like "However," "Therefore," or "In addition," unless absolutely necessary for logic.

### 2. SVG Architectural Integrity
- **Vertical Hierarchy Only:** Arrows must flow from Top to Bottom. Side-flows are strictly prohibited to maintain mobile readability.
- **Node Cap:** Maximum 7 nodes per diagram. If the system is more complex, decompose it into multiple SVGs (e.g., Overview -> Detailed Component).
- **Label Alignment:** Labels must sit directly on the arrow line, centered. Never to the side.

### 3. Metric-First Analysis
- **Abstract to Concrete:** Never say "The system became faster." Say "P99 latency dropped from 450ms to 120ms."
- **Data over Vague Adjectives:** Replace words like "High," "Fast," or "Massive" with actual numbers (e.g., 10k RPS, 99.99% Availability).

### 4. Mandatory Trade-off Disclosure
- Every solution must have a "Trade-off" or "Limitations" section. 
- If the user doesn't provide one, you must proactively analyze the architecture and suggest potential bottlenecks or edge cases where this solution might fail.

### 5. File & Directory Governance
- **Naming Convention:** Use kebab-case for filenames (e.g., `01-legacy-bottleneck.svg`).
- **Path Awareness:** Always check for the existence of `week{N}` directories before creating a new one to ensure the sequence `week1 -> week2 -> week3` is preserved.