(function () {
  const CONFIG = {
    refParam: "ref",
    ttlDays: null,
    storagePrefix: "ah_referral_",
    overwriteOnNewRef: true,
  };

  const storageKeys = {
    referrerId: CONFIG.storagePrefix + "referrer_id",
    sessionId: CONFIG.storagePrefix + "session_id",
    setAt: CONFIG.storagePrefix + "set_at",
    landingUrl: CONFIG.storagePrefix + "landing_url",
    utmSource: CONFIG.storagePrefix + "utm_source",
    utmMedium: CONFIG.storagePrefix + "utm_medium",
    utmCampaign: CONFIG.storagePrefix + "utm_campaign",
    utmTerm: CONFIG.storagePrefix + "utm_term",
    utmContent: CONFIG.storagePrefix + "utm_content",
  };

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function isExpired(timestamp) {
    if (!timestamp) return false;

    if (CONFIG.ttlDays === null) return false;

    const ttlMs = CONFIG.ttlDays * 24 * 60 * 60 * 1000;
    return Date.now() - Number(timestamp) > ttlMs;
  }

  async function updateCartAttributes(attributes) {
    try {
      const res = await fetch("/cart/update.js", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ attributes }),
      });

      const cart = await res.json();

      console.log(
        "[Referral Tracking] Cart attributes updated:",
        cart.attributes,
      );

      return cart;
    } catch (error) {
      console.error(
        "[Referral Tracking] Failed to update cart attributes:",
        error,
      );
    }
  }

  function clearStoredReferral() {
    Object.values(storageKeys).forEach((key) => localStorage.removeItem(key));
  }

  async function clearCartReferral() {
    await updateCartAttributes({
      referrer_id: "",
      session_id: "",
      referral_set_at: "",
      referral_landing_url: "",
      referral_source: "",
      referral_medium: "",
      referral_campaign: "",
      referral_term: "",
      referral_content: "",
    });
  }

  async function saveReferral(referrerId) {
    const now = new Date().toISOString();

    const utmSource = getParam("utm_source") || "";
    const utmMedium = getParam("utm_medium") || "";
    const utmCampaign = getParam("utm_campaign") || "";
    const utmTerm = getParam("utm_term") || "";
    const utmContent = getParam("utm_content") || "";
    const sessionId = getParam("session_id") || "";

    localStorage.setItem(storageKeys.referrerId, referrerId);
    localStorage.setItem(storageKeys.sessionId, sessionId);
    localStorage.setItem(storageKeys.setAt, String(Date.now()));
    localStorage.setItem(storageKeys.landingUrl, window.location.href);
    localStorage.setItem(storageKeys.utmSource, utmSource);
    localStorage.setItem(storageKeys.utmMedium, utmMedium);
    localStorage.setItem(storageKeys.utmCampaign, utmCampaign);
    localStorage.setItem(storageKeys.utmTerm, utmTerm);
    localStorage.setItem(storageKeys.utmContent, utmContent);

    await updateCartAttributes({
      referrer_id: referrerId,
      session_id: sessionId,
      referral_set_at: now,
      referral_landing_url: window.location.href,
      referral_source: utmSource,
      referral_medium: utmMedium,
      referral_campaign: utmCampaign,
      referral_term: utmTerm,
      referral_content: utmContent,
    });
  }

  async function restoreReferralToCart() {
    const referrerId = localStorage.getItem(storageKeys.referrerId);
    const setAt = localStorage.getItem(storageKeys.setAt);

    if (!referrerId) return;

    if (isExpired(setAt)) {
      clearStoredReferral();
      await clearCartReferral();
      console.log("[Referral Tracking] Referral expired and cleared.");
      return;
    }

    await updateCartAttributes({
      referrer_id: referrerId,
      session_id: localStorage.getItem(storageKeys.sessionId) || "",
      referral_set_at: setAt ? new Date(Number(setAt)).toISOString() : "",
      referral_landing_url: localStorage.getItem(storageKeys.landingUrl) || "",
      referral_source: localStorage.getItem(storageKeys.utmSource) || "",
      referral_medium: localStorage.getItem(storageKeys.utmMedium) || "",
      referral_campaign: localStorage.getItem(storageKeys.utmCampaign) || "",
      referral_term: localStorage.getItem(storageKeys.utmTerm) || "",
      referral_content: localStorage.getItem(storageKeys.utmContent) || "",
    });
  }

  async function initReferralTracking() {
    const newRef = getParam(CONFIG.refParam);
    const existingRef = localStorage.getItem(storageKeys.referrerId);

    if (newRef) {
      if (CONFIG.overwriteOnNewRef || !existingRef || existingRef !== newRef) {
        await saveReferral(newRef);
        console.log("[Referral Tracking] New referral saved:", newRef);
      }
      return;
    }

    await restoreReferralToCart();
  }

  document.addEventListener("DOMContentLoaded", initReferralTracking);

  window.AlertaReferralTracking = {
    clear: async function () {
      clearStoredReferral();
      await clearCartReferral();
      console.log("[Referral Tracking] Referral manually cleared.");
    },
    restore: restoreReferralToCart,
  };
})();

/*
  To use this referral tracking script in your Shopify theme, add the following line to your theme.liquid file, just before the closing </body> tag:
  <script src="{{ 'referral-tracking.js' | asset_url }}" defer="defer"></script>
*/
