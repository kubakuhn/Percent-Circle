// www/percent-circle.js
console.info("%c PERCENT-CIRCLE %c ".concat("0.6.1", " "), "color: black; background: coral; font-weight: 700;", "color: black; background: white; font-weight: 700;");
class PercentCircle extends HTMLElement {
  constructor() {
    super();
    this._unsubImageTpl = null;
    this._lastImageTpl = null;
    this._initialImageTplFetched = false;
  
    this._unsubPercentTpl = null;
    this._lastPercentTpl = null;
    this._initialPercentTplFetched = false;
  
    this._lastConn = null;
    this._lastHass = null;          // <--- neu: letztes hass merken
  
    this._initialFetchRetries = 0;  // <--- neu: Retry-Zähler
  
    this.svg = null;
    this.progressCircle = null;
    this.textEl = null;
    this.imgEl = null;
  
    this.radius = 0;
    this.circumference = 0;
    this._percent = 0;
    this._actionsWired = false;
  }
  
  connectedCallback() {
    // Wenn das Element (z. B. im picture-elements) neu angehängt wird,
    // gleich nochmal ein Update auslösen.
    if (this._lastHass) {
      // setTimeout, damit DOM steht bevor wir updaten
      setTimeout(() => { try { this.hass = this._lastHass; } catch {} }, 0);
    }
  }

  // -------------------- Helpers: Templates --------------------
  async _fetchTemplateOnce(hass, template, onValue) {
    try {
      const val = await hass.callWS({ type: "render_template", template });
      onValue?.(val);
      this._initialFetchRetries = 0; // Reset
      return true;
    } catch (e) {
      console.warn("[percent-circle] render_template (initial) failed:", e);
      return false;
    }
  }

  async _ensureTemplateSubscription(hass, template, kind) {
    // kind: "image" | "percent"
    const lastTplKey = kind === "image" ? "_lastImageTpl" : "_lastPercentTpl";
    const unsubKey   = kind === "image" ? "_unsubImageTpl" : "_unsubPercentTpl";

    const connChanged = this._lastConn !== hass.connection;
    const tplChanged  = this[lastTplKey] !== template;

    if (!template) {
      if (this[unsubKey]) { try { this[unsubKey](); } catch(_){} this[unsubKey] = null; }
      this[lastTplKey] = null;
      this._lastConn = hass.connection;
      return;
    }

    if (!tplChanged && !connChanged && this[unsubKey]) return;

    if (this[unsubKey]) { try { this[unsubKey](); } catch(_){} this[unsubKey] = null; }

    this[unsubKey] = await hass.connection.subscribeMessage((msg) => {
      const value = (msg && (msg.result ?? msg.event?.result)) ?? null;
      if (kind === "image") {
        const url = String(value ?? "");
        if (this.imgEl && url && url !== this.imgEl.getAttribute("href")) {
          this.imgEl.setAttribute("href", url);
          this.imgEl.setAttributeNS("http://www.w3.org/1999/xlink", "href", url);
        }
      } else {
        const num = this._toPercent(value);
        this._applyPercent(num);
      }
    }, { type: "render_template", template });


    this[lastTplKey] = template;
    this._lastConn = hass.connection;
  }

  // -------------------- Helpers: Prozent & Farben --------------------
  _toPercent(val) {
    const n = Number(val);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
    const m = String(val ?? "").match(/-?\d+(\.\d+)?/);
    const f = m ? parseFloat(m[0]) : 0;
    return Math.max(0, Math.min(100, Number.isFinite(f) ? f : 0));
  }

  _pickRingColorFor(percent) {
    // thresholds: [{ value: number, color: string }, ...]
    // Regel: erster Eintrag, dessen value >= percent, gewinnt.
    const thresholds = this.config?.thresholds;
    if (Array.isArray(thresholds) && thresholds.length) {
      const sorted = [...thresholds].sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
      const match = sorted.find(t => typeof t.value === "number" && t.value >= percent);
      if (match?.color) return match.color;
    }
    return this.config?.ring_color ?? "#03a9f4";
  }

  _applyPercent(percent) {
    this._percent = percent;
    if (this.progressCircle) {
      this.progressCircle.setAttribute(
        "stroke-dashoffset",
        this.circumference - (percent / 100) * this.circumference
      );
      const ringColor = this._pickRingColorFor(percent);
      if (this.progressCircle.getAttribute("stroke") !== ringColor) {
        this.progressCircle.setAttribute("stroke", ringColor);
      }
    }
    if (this.textEl) this.textEl.textContent = `${percent}%`;
  }

  _wireActions() {
    if (this._actionsWired) return;
    // Falls eine Aktion konfiguriert ist: Klicks annehmen
    if (this.config?.tap_action && this.config.tap_action.action) {
    this.style.cursor = "pointer";
    this.style.pointerEvents = "auto";
    this.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._handleTap();
    });
    this._actionsWired = true;
    }
  }

  _handleTap() {
    const ta = this.config?.tap_action;
    if (!ta || !ta.action) return;
    // Nur 'call-service' abdecken (dein Use-Case)
    if (ta.action === "call-service" && ta.service && this._lastHass) {
      // 'domain.service' parsen
      const [domain, service] = String(ta.service).split(".", 2);
      const data = ta.service_data || ta.data || {};
      if (domain && service) {
        this._lastHass.callService(domain, service, data);
      } else {
        console.warn("[percent-circle] Invalid tap_action.service:", ta.service);
      }
    } else if (ta.action === "navigate" && ta.navigation_path) {
      history.pushState(null, "", ta.navigation_path);
      window.dispatchEvent(new Event("location-changed"));

    } else if (ta.action === "url" && ta.url_path) {
      window.open(ta.url_path, ta.new_tab === false ? "_self" : "_blank");

    } else if (ta.action === "more-info" && this._lastHass) {
      const entityId = ta.entity || this.config?.entity || this.config?.percent_entity;
      if (entityId) {
        this._lastHass.fire("hass-more-info", { entityId });
      }

    }
  }

  // -------------------- HA Setter (synchron) --------------------
  set hass(hass) {
    this._lastHass = hass;
    // EINMALIGES DOM-SETUP (kein Rebuild -> kein Flackern)
    if (!this.svg) {
      const size        = this.config?.size        ?? 120;        // px
      const stroke      = this.config?.stroke      ?? 10;         // px
      const textColor   = this.config?.color       ?? "#000";     // Textfarbe
      const trackColor  = this.config?.track_color ?? "#e0e0e0";  // Hintergrund-Ring
      const imgScale    = Math.max(0, Math.min(1, this.config?.image_scale ?? 0.8)); // 0..1
      const useCard     = !this.config?.no_card;
      const fitContainer = this.config?.fit === "container";

      const innerDiameter = size - stroke * 2;
      const imgBox = innerDiameter * imgScale;
      const imgX = (size - imgBox) / 2;
      const imgY = (size - imgBox) / 2;

      const vbPad = stroke / 2; // Luft, damit Stroke nicht clippt
      const viewBox = `${-vbPad} ${-vbPad} ${size + stroke} ${size + stroke}`;

      this.radius = (size / 2) - (stroke / 2);
      this.circumference = 2 * Math.PI * this.radius;

      const wrapperStart = useCard
        ? `<ha-card class="transparent-card"><div class="card-content">`
        : `<div class="card-content">`;
      const wrapperEnd = useCard ? `</div></ha-card>` : `</div>`;

      this.innerHTML = `
        ${wrapperStart}
          <svg id="circleSvg"
            ${fitContainer ? 'width="100%" height="100%"' : `width="${size}" height="${size}"`}
            viewBox="${viewBox}"
            style="display:block; overflow:visible"
            preserveAspectRatio="xMidYMid meet">
            <defs>
              <clipPath id="clipCircle">
                <circle cx="${size/2}" cy="${size/2}" r="${innerDiameter/2}"></circle>
              </clipPath>
            </defs>

            <!-- Hintergrund-Ring -->
            <circle id="track" cx="${size/2}" cy="${size/2}" r="${this.radius}"
              stroke="${trackColor}" stroke-width="${stroke}" fill="none" />

            <!-- Fortschritts-Ring (Farbe dynamisch per thresholds) -->
            <circle id="progress" cx="${size/2}" cy="${size/2}" r="${this.radius}"
              stroke="${this._pickRingColorFor(0)}" stroke-width="${stroke}" fill="none"
              transform="rotate(-90 ${size/2} ${size/2})"
              style="transition: stroke-dashoffset 300ms ease, stroke 200ms ease" />

            <!-- zentriertes, skaliertes, kreisförmig geclippetes Bild -->
            <image id="innerImage"
              x="${imgX}" y="${imgY}"
              width="${imgBox}" height="${imgBox}"
              clip-path="url(#clipCircle)"
              preserveAspectRatio="xMidYMid slice"></image>

            <!-- Prozent-Text -->
            <text id="percentText"
              x="${size/2}" y="${size/2}"
              text-anchor="middle" dominant-baseline="middle"
              font-size="${size/6}" fill="${textColor}">0%</text>
          </svg>
        ${wrapperEnd}
        <style>
          ${useCard ? `
          ha-card.transparent-card {
            background: transparent !important;
            box-shadow: none !important;
            border: none !important;
            --ha-card-background: transparent;
            --ha-card-border-width: 0;
            --ha-card-border-color: transparent;
            --ha-card-box-shadow: none;
            overflow: visible;
          }` : ``}
          .card-content { overflow: visible; pointer-events: auto; ${fitContainer ? 'width:100%; height:100%;' : ''} }
        </style>
      `;

      // Refs merken
      this.svg = this.querySelector("#circleSvg");
      this.progressCircle = this.querySelector("#progress");
      this.textEl = this.querySelector("#percentText");
      this.imgEl = this.querySelector("#innerImage");

      // static attribute
      this.progressCircle.setAttribute("stroke-dasharray", this.circumference);
	  // Aktionen nach DOM-Setup aktivieren
	  this._wireActions();
    }

    // ------- Prozentquelle: percent_template > percent_entity > entity -------
    const percentTpl = this.config?.percent_template;
    const percentEntityId = this.config?.percent_entity || this.config?.entity;

    if (percentTpl) {
      // 1) Falls konstant (z. B. "{{ 30 }}"), sofort lokal setzen
      const constMatch = String(percentTpl).match(/^\s*\{\{\s*([0-9]+(?:\.[0-9]+)?)\s*\}\}\s*$/);
      if (constMatch) {
        this._applyPercent(this._toPercent(constMatch[1]));
      }

      // 2) Initialer Fetch – nur als "done" markieren, wenn er klappt
      if (!this._initialPercentTplFetched) {
        this._fetchTemplateOnce(hass, percentTpl, (val) => this._applyPercent(this._toPercent(val)))
          .then((ok) => {
            if (ok) {
              this._initialPercentTplFetched = true;
            } else {
              // Retry mit kleinem Backoff, bis zu 5x
              if (this._initialFetchRetries < 5) {
                const delay = 150 * Math.pow(2, this._initialFetchRetries++); // 150,300,600,1200,2400ms
                setTimeout(() => {
                  if (this._lastHass) this.hass = this._lastHass;
                }, delay);
              }
            }
          });
      }

      // 3) Live-Subscription (liefert Änderungen nach)
      this._ensureTemplateSubscription(hass, percentTpl, "percent");

      // 4) Soft-Fallback: solange 0% und es gibt eine Entity, nimm deren Wert
      if (this._percent === 0 && (this.config?.percent_entity || this.config?.entity)) {
        const pe = this.config.percent_entity || this.config.entity;
        const so = hass.states[pe];
        if (so) this._applyPercent(this._toPercent(so.state));
      }
    } else {
      // Kein percent_template -> percent_entity / entity verwenden
      if (this._unsubPercentTpl) { try { this._unsubPercentTpl(); } catch(_){} this._unsubPercentTpl = null; }
      this._lastPercentTpl = null;
      this._lastConn = hass.connection;

      const stateObj = percentEntityId ? hass.states[percentEntityId] : undefined;
      const stateStr = stateObj ? stateObj.state : "unavailable";
      this._applyPercent(this._toPercent(stateStr));
    }


    // ------- Bildquelle: image_template > image_entity > image -------
    const imageTpl = this.config?.image_template;
    if (imageTpl) {
      if (!this._initialImageTplFetched) {
        this._fetchTemplateOnce(hass, imageTpl, (url) => {
          const u = String(url ?? "");
          if (u && this.imgEl && u !== this.imgEl.getAttribute("href")) {
            this.imgEl.setAttribute("href", u);
            this.imgEl.setAttributeNS("http://www.w3.org/1999/xlink", "href", u);
          }
        });
        this._initialImageTplFetched = true;
      }
      this._ensureTemplateSubscription(hass, imageTpl, "image");
    } else {
      if (this._unsubImageTpl) { try { this._unsubImageTpl(); } catch(_){} this._unsubImageTpl = null; }
      this._lastImageTpl = null;
      this._lastConn = hass.connection;

      let imgSrc =
        (this.config?.image_entity ? (hass.states[this.config.image_entity]?.state ?? "") : "") ||
        this.config?.image ||
        "";
      if (imgSrc && this.imgEl && imgSrc !== this.imgEl.getAttribute("href")) {
        this.imgEl.setAttribute("href", imgSrc);
        this.imgEl.setAttributeNS("http://www.w3.org/1999/xlink", "href", imgSrc);
      }
    }
  }

  setConfig(config) {
    // mindestens eine Prozentquelle muss vorhanden sein
    if (!config.percent_template && !config.percent_entity && !config.entity) {
      throw new Error("You need to define a percent source: percent_template or percent_entity/entity");
    }
    this.config = config;
	// Actions ggf. neu verdrahten, falls Config geändert wurde
	this._actionsWired = false;
	if (this.svg) this._wireActions();
  }

  getCardSize() { return 3; }
  getGridOptions() {
    return { rows: 3, columns: 6, min_rows: 3, max_rows: 3 };
  }
}

// nur einmal registrieren
if (!customElements.get("percent-circle")) {
  customElements.define("percent-circle", PercentCircle);
}
