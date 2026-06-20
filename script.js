async function initPrism() {
  const container = document.querySelector("[data-prism]");
  if (!container) return;

  const { Renderer, Triangle, Program, Mesh } = await import("https://esm.sh/ogl@1.0.11");
  createPrism(container, { Renderer, Triangle, Program, Mesh });
}

function createPrism(container, ogl) {
  const { Renderer, Triangle, Program, Mesh } = ogl;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const height = 3.5;
  const baseWidth = 5.5;
  const baseHalf = baseWidth * 0.5;
  const glow = 0.62;
  const noise = 0.22;
  const scale = window.innerWidth < 720 ? 2.18 : 2.52;
  const colorFrequency = 1.84;
  const hueShift = 0.45;
  const bloom = 0.88;
  const timeScale = prefersReducedMotion ? 0 : 0.38;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const renderer = new Renderer({ dpr, alpha: true, antialias: false });
  const gl = renderer.gl;

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
  container.appendChild(gl.canvas);

  const vertex = `
    attribute vec2 position;
    void main() {
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const fragment = `
    precision highp float;

    uniform vec2 iResolution;
    uniform float iTime;
    uniform float uHeight;
    uniform float uBaseHalf;
    uniform mat3 uRot;
    uniform int uUseBaseWobble;
    uniform float uGlow;
    uniform vec2 uOffsetPx;
    uniform float uNoise;
    uniform float uSaturation;
    uniform float uScale;
    uniform float uHueShift;
    uniform float uColorFreq;
    uniform float uBloom;
    uniform float uCenterShift;
    uniform float uInvBaseHalf;
    uniform float uInvHeight;
    uniform float uMinAxis;
    uniform float uPxScale;
    uniform float uTimeScale;

    vec4 tanh4(vec4 x) {
      vec4 e2x = exp(2.0 * x);
      return (e2x - 1.0) / (e2x + 1.0);
    }

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    float sdOctaAnisoInv(vec3 p) {
      vec3 q = vec3(abs(p.x) * uInvBaseHalf, abs(p.y) * uInvHeight, abs(p.z) * uInvBaseHalf);
      float m = q.x + q.y + q.z - 1.0;
      return m * uMinAxis * 0.5773502691896258;
    }

    float sdPyramidUpInv(vec3 p) {
      float oct = sdOctaAnisoInv(p);
      float halfSpace = -p.y;
      return max(oct, halfSpace);
    }

    mat3 hueRotation(float a) {
      float c = cos(a), s = sin(a);
      mat3 W = mat3(
        0.299, 0.587, 0.114,
        0.299, 0.587, 0.114,
        0.299, 0.587, 0.114
      );
      mat3 U = mat3(
         0.701, -0.587, -0.114,
        -0.299,  0.413, -0.114,
        -0.300, -0.588,  0.886
      );
      mat3 V = mat3(
         0.168, -0.331,  0.500,
         0.328,  0.035, -0.500,
        -0.497,  0.296,  0.201
      );
      return W + U * c + V * s;
    }

    void main() {
      vec2 f = (gl_FragCoord.xy - 0.5 * iResolution.xy - uOffsetPx) * uPxScale;
      float z = 5.0;
      float d = 0.0;
      vec3 p;
      vec4 o = vec4(0.0);
      float centerShift = uCenterShift;
      float cf = uColorFreq;
      mat2 wob = mat2(1.0);

      if (uUseBaseWobble == 1) {
        float t = iTime * uTimeScale;
        float c0 = cos(t + 0.0);
        float c1 = cos(t + 33.0);
        float c2 = cos(t + 11.0);
        wob = mat2(c0, c1, c2, c0);
      }

      const int STEPS = 100;
      for (int i = 0; i < STEPS; i++) {
        p = vec3(f, z);
        p.xz = p.xz * wob;
        p = uRot * p;
        vec3 q = p;
        q.y += centerShift;
        d = 0.1 + 0.2 * abs(sdPyramidUpInv(q));
        z -= d;
        o += (sin((p.y + z) * cf + vec4(0.0, 1.0, 2.0, 3.0)) + 1.0) / d;
      }

      o = tanh4(o * o * (uGlow * uBloom) / 1e5);
      vec3 col = o.rgb;
      float n = rand(gl_FragCoord.xy + vec2(iTime));
      col += (n - 0.5) * uNoise;
      col = clamp(col, 0.0, 1.0);

      float L = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = clamp(mix(vec3(L), col, uSaturation), 0.0, 1.0);

      if (abs(uHueShift) > 0.0001) {
        col = clamp(hueRotation(uHueShift) * col, 0.0, 1.0);
      }

      gl_FragColor = vec4(col, o.a);
    }
  `;

  const geometry = new Triangle(gl);
  const iResBuf = new Float32Array(2);
  const offsetPxBuf = new Float32Array(2);
  const rotBuf = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      iResolution: { value: iResBuf },
      iTime: { value: 0 },
      uHeight: { value: height },
      uBaseHalf: { value: baseHalf },
      uUseBaseWobble: { value: 1 },
      uRot: { value: rotBuf },
      uGlow: { value: glow },
      uOffsetPx: { value: offsetPxBuf },
      uNoise: { value: noise },
      uSaturation: { value: 1.5 },
      uScale: { value: scale },
      uHueShift: { value: hueShift },
      uColorFreq: { value: colorFrequency },
      uBloom: { value: bloom },
      uCenterShift: { value: height * 0.25 },
      uInvBaseHalf: { value: 1 / baseHalf },
      uInvHeight: { value: 1 / height },
      uMinAxis: { value: Math.min(baseHalf, height) },
      uPxScale: { value: 1 },
      uTimeScale: { value: timeScale }
    }
  });
  const mesh = new Mesh(gl, { geometry, program });

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h);
    iResBuf[0] = gl.drawingBufferWidth;
    iResBuf[1] = gl.drawingBufferHeight;
    offsetPxBuf[0] = 0;
    offsetPxBuf[1] = -34 * dpr;
    program.uniforms.uPxScale.value = 1 / ((gl.drawingBufferHeight || 1) * 0.1 * scale);
  };

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let raf = 0;
  const t0 = performance.now();
  const render = (t) => {
    program.uniforms.iTime.value = (t - t0) * 0.001;
    renderer.render({ scene: mesh });
    if (timeScale > 0) raf = requestAnimationFrame(render);
    else raf = 0;
  };

  const start = () => {
    if (!raf) raf = requestAnimationFrame(render);
  };
  const stop = () => {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  };

  const io = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) start();
    else stop();
  });
  io.observe(container);
}

const drafts = {
  founder: {
    subject: "Northstar Ventures",
    body:
      "Why they match: pre-seed investor with logistics software interest. Suggested angle: share the Lightfern hackathon project as a fast prototype for AI-assisted GTM research and drafting."
  },
  polished: {
    subject: "Harbor Freight Ops",
    body:
      "Why they match: UK operations team at a mid-market logistics company. Suggested angle: show how better research packets help Lightfern draft more relevant outbound to operators."
  }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function setVoice(voice) {
  const draft = drafts[voice];
  if (!draft) return;

  $$("[data-voice]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.voice === voice);
  });

  const subject = $("[data-draft-subject]");
  const body = $("[data-draft-body]");
  if (subject) subject.textContent = draft.subject;
  if (body) body.textContent = draft.body;
}

function updateCountdown() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  let diff = Math.max(0, end - now);

  const hours = String(Math.floor(diff / 3600000)).padStart(2, "0");
  diff %= 3600000;
  const minutes = String(Math.floor(diff / 60000)).padStart(2, "0");
  diff %= 60000;
  const seconds = String(Math.floor(diff / 1000)).padStart(2, "0");

  const hourNode = $("[data-hours]");
  const minuteNode = $("[data-minutes]");
  const secondNode = $("[data-seconds]");
  if (hourNode) hourNode.textContent = hours;
  if (minuteNode) minuteNode.textContent = minutes;
  if (secondNode) secondNode.textContent = seconds;
}

$$("[data-voice]").forEach((button) => {
  button.addEventListener("click", () => setVoice(button.dataset.voice));
});

const modal = $(".waitlist-modal");
$$("[data-open-waitlist]").forEach((button) => {
  button.addEventListener("click", () => modal?.showModal());
});

const vipTrigger = $("[data-vip-trigger]");
if (vipTrigger) {
  vipTrigger.addEventListener("click", () => {
    vipTrigger.textContent = "NOODLE-2026";
    vipTrigger.blur();
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16 }
);

$$("[data-reveal]").forEach((node) => observer.observe(node));

updateCountdown();
setInterval(updateCountdown, 1000);
initPrism();
