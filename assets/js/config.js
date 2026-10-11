/*
 * College Quarters — site settings.
 * These are the only values you should ever need to change by hand.
 */
window.CQ_CONFIG = {
  // Live room list (fetched on every visit so availability is always current).
  FEED_URL: "https://rentals.jewishbobcats.com/?feed=rooms",

  // Back-office web app that receives the forms (inquiries and tenant link requests).
  // Must be the Google Apps Script "Web app" URL (usually ends in /exec).
  APP_URL: "https://rentals.jewishbobcats.com/",

  // Shown after the price when the feed gives a plain number, e.g. 650 -> "$650 / month".
  PRICE_SUFFIX: "/ month",

  // Contact details to show if the live feed can't be reached.
  // (When the feed loads, its phone / email / address are used instead.)
  FALLBACK_CONTACT: {
    landlord: "Chabad Servicing Ohio University",
    phone: "",
    email: "",
    address: "Athens, Ohio"
  }
};
