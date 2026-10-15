/*
 * College Quarters — site settings (not wording: all visible text is in /wording.json).
 * Rooms, wording and contact details come from data/site.json (saved by the Rentals app's Website tab);
 * the site never calls the Apps Script when a page loads.
 */
window.CQ_CONFIG = {
  // Back-office web app that receives the forms (inquiries and tenant link requests).
  // Must be the Google Apps Script "Web app" URL (usually ends in /exec).
  APP_URL: "https://script.google.com/macros/s/AKfycbwzun38kkYzRn2IHmWfsK7O_mP94rUlQKD6AXve26XokUHlufXDuC_XGAXVI4YoJbY/exec",

  // Backup contact details, used only if the saved website data has none.
  FALLBACK_CONTACT: {
    landlord: "Chabad Servicing Ohio University",
    phone: "740-541-6737",
    email: "chanee@jewishbobcats.com",
    address: "12 N College St Athens OH 45701"
  }
};
