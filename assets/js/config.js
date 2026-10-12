/*
 * College Quarters — site settings (not wording: all visible text is in /wording.json).
 */
window.CQ_CONFIG = {
  // Live room list (fetched on every visit so availability is always current).
  FEED_URL: "https://script.google.com/macros/s/AKfycbwzun38kkYzRn2IHmWfsK7O_mP94rUlQKD6AXve26XokUHlufXDuC_XGAXVI4YoJbY/exec?feed=rooms",

  // Back-office web app that receives the forms (inquiries and tenant link requests).
  // Must be the Google Apps Script "Web app" URL (usually ends in /exec).
  APP_URL: "https://script.google.com/macros/s/AKfycbwzun38kkYzRn2IHmWfsK7O_mP94rUlQKD6AXve26XokUHlufXDuC_XGAXVI4YoJbY/exec",

  // Backup contact details, used only when the live feed can't be loaded.
  // Normally landlord, phone, e-mail and address all come from the feed.
  FALLBACK_CONTACT: {
    landlord: "Chabad Servicing Ohio University",
    phone: "740-541-5737",
    email: "chanee@jewishbobcats.com",
    address: "Athens, Ohio"
  }
};
