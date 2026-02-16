(() => {
  const VARIANTS = {
    A: "Spark real connections in 45 seconds.",
    C: "Real chemistry in 45 seconds — anonymous until mutual yes.",
    E: "Real chemistry in 45 seconds — anonymous until mutual yes.",
    F: "Real chemistry in 45 seconds — anonymous until mutual yes.",
  };

  const THEME_KEY = "verity_theme_mode";
  const VARIANT_KEY = "verity_h1_variant";
  const LUXURY_THEMES = ["luxury-light", "luxury-dark"];
  const LUXURY_INTENSITIES = ["subtle", "medium", "bold"];

  const params = new URLSearchParams(window.location.search);
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const forcedVariant = (params.get("variant") || "").toUpperCase();
  let variant = localStorage.getItem(VARIANT_KEY);

  if (forcedVariant && VARIANTS[forcedVariant]) {
    variant = forcedVariant;
    localStorage.setItem(VARIANT_KEY, variant);
  }

  if (!variant || !VARIANTS[variant]) {
    const controlPool = ["A", "C"];
    variant = controlPool[Math.floor(Math.random() * controlPool.length)];
    localStorage.setItem(VARIANT_KEY, variant);
  }

  const heroTitle = document.getElementById("heroTitle");
  if (heroTitle) heroTitle.textContent = VARIANTS[variant];

  const html = document.documentElement;
  const body = document.body;
  const themeToggle = document.getElementById("themeToggle");

  const isLuxuryVariant = variant === "E" || variant === "F";
  const isLuxuryFVariant = variant === "F";
  const isCinematicVariant = variant === "F";

  body.classList.toggle("is-luxury", isLuxuryVariant);
  body.classList.toggle("is-luxury-f", isLuxuryFVariant);
  body.classList.toggle("is-cinematic", isCinematicVariant);

  const TELEMETRY_SESSION_KEY = "verity_lp_session_id";
  const makeSessionId = () => {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  };

  let telemetrySessionId = "";
  try {
    telemetrySessionId = sessionStorage.getItem(TELEMETRY_SESSION_KEY) || "";
    if (!telemetrySessionId) {
      telemetrySessionId = makeSessionId();
      sessionStorage.setItem(TELEMETRY_SESSION_KEY, telemetrySessionId);
    }
  } catch {
    telemetrySessionId = makeSessionId();
  }

  const intensityClasses = LUXURY_INTENSITIES.map((mode) => `lux-intensity-${mode}`);
  body.classList.remove(...intensityClasses);

  let luxuryIntensity = "medium";
  if (isLuxuryFVariant) {
    const forcedIntensity =
      (params.get("lux") || params.get("intensity") || params.get("lux_intensity") || "").toLowerCase();

    if (forcedIntensity && LUXURY_INTENSITIES.includes(forcedIntensity)) {
      luxuryIntensity = forcedIntensity;
    }

    body.classList.add(`lux-intensity-${luxuryIntensity}`);
  }

  let themeMode = "default";
  if (isLuxuryVariant) {
    const forcedTheme = params.get("theme");
    const savedTheme = localStorage.getItem(THEME_KEY);

    if (forcedTheme && LUXURY_THEMES.includes(forcedTheme)) {
      themeMode = forcedTheme;
    } else if (savedTheme && LUXURY_THEMES.includes(savedTheme)) {
      themeMode = savedTheme;
    } else {
      // Luxury variants default to dark.
      themeMode = "luxury-dark";
    }
  }

  const syncThemeField = () => {
    const themeField = document.querySelector("input[name='theme_mode']");
    if (themeField) themeField.value = themeMode;
  };

  const setThemeToggleLabel = () => {
    if (!themeToggle) return;
    const isDark = themeMode === "luxury-dark";
    themeToggle.textContent = isDark ? "☀️ Light" : "🌙 Dark";
    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
    themeToggle.title = isDark ? "Switch to light" : "Switch to dark";
  };

  const applyTheme = (nextTheme, persist = true) => {
    themeMode = nextTheme;
    html.classList.add("theme-shifting");
    window.setTimeout(() => html.classList.remove("theme-shifting"), 340);
    html.setAttribute("data-theme", themeMode);
    if (persist) {
      localStorage.setItem(THEME_KEY, themeMode);
    }
    setThemeToggleLabel();
    syncThemeField();
  };

  if (isLuxuryVariant) {
    applyTheme(themeMode);
  } else {
    html.setAttribute("data-theme", themeMode);
  }

  if (themeToggle) {
    if (isLuxuryVariant) {
      themeToggle.hidden = false;
      setThemeToggleLabel();
      themeToggle.addEventListener("click", () => {
        applyTheme(themeMode === "luxury-dark" ? "luxury-light" : "luxury-dark");
        emitTelemetry("theme_toggle", { theme_mode: themeMode });
      });
    } else {
      themeToggle.hidden = true;
    }
  }

  // Only load cinematic video sources for variant F.
  const cinematicVideos = document.querySelectorAll("video.cinematic-only");
  const isSmallScreen = window.matchMedia("(max-width: 720px)").matches;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);

  cinematicVideos.forEach((video) => {
    const source = video.querySelector("source");
    if (source && !source.dataset.src && source.getAttribute("src")) {
      source.dataset.src = source.getAttribute("src");
    }

    const isHeroAmbient = video.classList.contains("hero-ambient-video");
    const shouldSkipForSafety = prefersReducedMotion || saveData || (isHeroAmbient && isSmallScreen);

    if (!isCinematicVariant || shouldSkipForSafety) {
      if (source) source.removeAttribute("src");
      video.load();
      return;
    }

    if (source && !source.getAttribute("src") && source.dataset.src) {
      source.setAttribute("src", source.dataset.src);
    }

    video.preload = "metadata";
    video.load();

    if (video.autoplay) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          // Autoplay can be blocked in some browsers; silent fallback is fine.
        });
      }
    }
  });

  const experimentId = isCinematicVariant
    ? `hero_h1_v3_luxury_f_${luxuryIntensity}`
    : isLuxuryVariant
      ? "hero_h1_v2_luxury_e"
      : "hero_h1_v1";

  const visualVariant = isCinematicVariant
    ? `luxury-cinematic-${luxuryIntensity}`
    : isLuxuryVariant
      ? "luxury"
      : "standard";

  const hiddenValues = {
    hero_variant: variant,
    visual_variant: visualVariant,
    theme_mode: themeMode,
    luxury_intensity: isLuxuryFVariant ? luxuryIntensity : "",
    experiment_id: experimentId,
    utm_source: params.get("utm_source") || "",
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: params.get("utm_campaign") || "",
    utm_content: params.get("utm_content") || "",
    utm_term: params.get("utm_term") || "",
    ref: params.get("ref") || "",
    landing_path: window.location.pathname || "/",
    submitted_at_iso: new Date().toISOString(),
  };

  document.querySelectorAll("input[type='hidden'][name]").forEach((el) => {
    if (Object.prototype.hasOwnProperty.call(hiddenValues, el.name)) {
      el.value = hiddenValues[el.name];
    }
  });

  const telemetryEndpoint = (body && body.dataset && body.dataset.telemetryEndpoint) || "";

  const emitTelemetry = (eventName, props = {}) => {
    const payload = {
      event: eventName,
      timestamp_iso: new Date().toISOString(),
      session_id: telemetrySessionId,
      hero_variant: variant,
      visual_variant: visualVariant,
      theme_mode: themeMode,
      luxury_intensity: isLuxuryFVariant ? luxuryIntensity : "",
      experiment_id: experimentId,
      landing_path: window.location.pathname || "/",
      utm_source: hiddenValues.utm_source,
      utm_medium: hiddenValues.utm_medium,
      utm_campaign: hiddenValues.utm_campaign,
      utm_content: hiddenValues.utm_content,
      utm_term: hiddenValues.utm_term,
      ...props,
    };

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);

    document.dispatchEvent(
      new CustomEvent("verity:telemetry", {
        detail: payload,
      })
    );

    if (typeof window.plausible === "function") {
      try {
        window.plausible(eventName, {
          props: {
            hero_variant: payload.hero_variant,
            visual_variant: payload.visual_variant,
            theme_mode: payload.theme_mode,
            luxury_intensity: payload.luxury_intensity,
            experiment_id: payload.experiment_id,
            target: payload.target || "",
            depth_pct: payload.depth_pct || "",
          },
        });
      } catch {
        // no-op
      }
    }

    if (!telemetryEndpoint) return;

    const bodyJson = JSON.stringify(payload);

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([bodyJson], { type: "application/json" });
        navigator.sendBeacon(telemetryEndpoint, blob);
        return;
      }
    } catch {
      // fall through to fetch
    }

    fetch(telemetryEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyJson,
      keepalive: true,
    }).catch(() => {
      // no-op
    });
  };

  emitTelemetry("lp_exposure", {
    viewport_w: window.innerWidth,
    viewport_h: window.innerHeight,
  });

  document.querySelectorAll("[data-track]").forEach((el) => {
    el.addEventListener("click", () => {
      emitTelemetry("lp_click", {
        target: el.getAttribute("data-track") || "",
      });
    });
  });

  const scrollMilestones = [25, 50, 75, 90];
  const seenMilestones = new Set();
  const onScrollDepth = () => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll <= 0) return;
    const depth = Math.round((window.scrollY / maxScroll) * 100);

    scrollMilestones.forEach((milestone) => {
      if (depth >= milestone && !seenMilestones.has(milestone)) {
        seenMilestones.add(milestone);
        emitTelemetry("lp_scroll_depth", { depth_pct: milestone });
      }
    });
  };

  window.addEventListener("scroll", onScrollDepth, { passive: true });

  const sectionTrackIds = ["vibe", "how", "why", "waitlist", "faq"];
  if ("IntersectionObserver" in window) {
    const sectionObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          emitTelemetry("lp_section_view", {
            target: entry.target.id || "unknown",
          });
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.24 }
    );

    sectionTrackIds.forEach((id) => {
      const section = document.getElementById(id);
      if (section) sectionObserver.observe(section);
    });
  }

  const revealSelectors = [
    "#vibe h2",
    "#vibe .media-card",
    "#problem .narrow",
    "#how .card",
    "#why .card",
    "#safety .narrow",
    "#waitlist .spotlight",
    "#faq .faq-item",
    ".final-cta .narrow",
  ];

  if (isLuxuryFVariant) {
    revealSelectors.push("#how h2", "#why h2", "#safety h2", "#waitlist h2", "#faq h2", ".preview-card");

    const goldRevealSelectors = [
      "#vibe h2",
      "#vibe .media-card",
      "#how h2",
      "#how .card",
      "#why h2",
      "#why .card",
      "#waitlist h2",
      "#waitlist .spotlight",
      ".final-cta h2",
      ".preview-card",
    ];

    document.querySelectorAll(goldRevealSelectors.join(", ")).forEach((el) => {
      el.classList.add("gold-reveal");
    });
  }

  const revealTargets = document.querySelectorAll(revealSelectors.join(", "));
  revealTargets.forEach((el, i) => {
    el.classList.add("reveal");
    el.style.transitionDelay = `${(i % 3) * 70}ms`;
  });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
    );

    revealTargets.forEach((el) => io.observe(el));

    // Fallback: ensure long pages (screenshots/automation/no-scroll sessions)
    // don't keep lower sections hidden forever.
    window.setTimeout(() => {
      revealTargets.forEach((el) => el.classList.add("is-visible"));
    }, 1400);
  } else {
    revealTargets.forEach((el) => el.classList.add("is-visible"));
  }

  const form = document.getElementById("waitlistForm");
  if (form) {
    let formStarted = false;

    form.addEventListener("focusin", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (formStarted) return;
      if (!target.matches("input, select, textarea")) return;

      formStarted = true;
      emitTelemetry("waitlist_form_start", {
        target: target.getAttribute("name") || target.id || "unknown",
      });
    });

    form.addEventListener("submit", () => {
      const ts = form.querySelector("input[name='submitted_at_iso']");
      const themeField = form.querySelector("input[name='theme_mode']");
      const intensityField = form.querySelector("input[name='luxury_intensity']");
      const cityField = form.querySelector("select[name='city']");
      if (ts) ts.value = new Date().toISOString();
      if (themeField) themeField.value = themeMode;
      if (intensityField) intensityField.value = isLuxuryFVariant ? luxuryIntensity : "";

      emitTelemetry("waitlist_form_submit", {
        city: cityField instanceof HTMLSelectElement ? cityField.value : "",
      });
    });
  }

  document.querySelectorAll("#faq details").forEach((item, index) => {
    item.addEventListener("toggle", () => {
      if (!(item instanceof HTMLDetailsElement)) return;
      if (!item.open) return;

      const summary = item.querySelector("summary");
      emitTelemetry("faq_open", {
        target: summary ? summary.textContent?.trim().slice(0, 80) || `faq_${index + 1}` : `faq_${index + 1}`,
      });
    });
  });
})();
