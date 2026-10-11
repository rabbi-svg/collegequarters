/*
 * College Quarters — site settings.
 * These are the only values you should ever need to change by hand.
 */
window.CQ_CONFIG = {
  // Live room list (fetched on every visit so availability is always current).
  FEED_URL: "https://script.google.com/macros/s/AKfycbwzun38kkYzRn2IHmWfsK7O_mP94rUlQKD6AXve26XokUHlufXDuC_XGAXVI4YoJbY/exec?feed=rooms",

  // Back-office web app that receives the forms (inquiries and tenant link requests).
  // Must be the Google Apps Script "Web app" URL (usually ends in /exec).
  APP_URL: "https://script.google.com/macros/s/AKfycbwzun38kkYzRn2IHmWfsK7O_mP94rUlQKD6AXve26XokUHlufXDuC_XGAXVI4YoJbY/exec",

  // Shown after the price when the feed gives a plain number, e.g. 650 -> "$650 / month".
  PRICE_SUFFIX: "/ month",

  // Contact details shown on the site. Phone and e-mail always come from here.
  // Landlord and address come from the live feed when it loads (these are the backup).
  FALLBACK_CONTACT: {
    landlord: "Chabad Servicing Ohio University",
    phone: "740-541-5737",
    email: "chanee@jewishbobcats.com",
    address: "Athens, Ohio"
  }
};
