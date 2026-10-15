/**
 * WebsitePublish.gs — saves the College Quarters website data to GitHub.
 *
 * What it does: builds the website's data (the Wording sheet's texts, the listed rooms with price,
 * description, availability and photos, and the business contact details) and saves it as
 * data/site.json in the GitHub repository rabbi-svg/collegequarters. GitHub then republishes
 * https://collegequarters.net/ in about a minute. The website never calls this app when a page opens.
 *
 * When it runs:
 *  - every Save on the Website tab (rooms, one room's listing, wording, photos), and Save on Setup;
 *  - by itself once a night (about 1 AM), so availability that follows the leases stays current.
 *    Run setupWebsite() once from the editor to switch the nightly save on.
 *
 * Only the fields the website uses are saved: no tenant information.
 *
 * Setup: Project Settings > Script properties > add GITHUB_TOKEN with your GitHub access key.
 */

var WEBSITE_GITHUB_REPO = 'rabbi-svg/collegequarters';
var WEBSITE_GITHUB_BRANCH = 'main';
var WEBSITE_DATA_PATH = 'data/site.json';
var WEBSITE_DAILY_HOUR = 1; // the nightly save runs between 1 and 2 AM

/**
 * Builds the website data and saves it to GitHub.
 * Returns { ok: true, message } or { ok: false, error } (plain words, safe to show on the Website tab).
 * Never call this from inside withLock_ (it takes the same lock itself).
 */
function publishWebsite() {
  var lock = LockService.getScriptLock();
  try {
    var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    if (!token) {
      return { ok: false, error: 'Website not updated: the GitHub key is missing. Add GITHUB_TOKEN under Project Settings > Script properties.' };
    }
    // Read the sheets only once the lock is held, so two saves close together can never
    // put older data on the website after newer data.
    lock.waitLock(30000);
    var json = JSON.stringify(websiteData_(), null, 2) + '\n';
    for (var attempt = 0; attempt < 2; attempt++) {
      var current = githubRequest_('get', token, '?ref=' + encodeURIComponent(WEBSITE_GITHUB_BRANCH));
      var sha = null;
      if (current.code === 200 && current.body) {
        sha = current.body.sha;
        var saved = Utilities.newBlob(Utilities.base64Decode(String(current.body.content || '').replace(/\s/g, ''))).getDataAsString('UTF-8');
        if (saved === json) {
          return { ok: true, message: 'Saved. The website is already up to date.' };
        }
      } else if (current.code !== 404) {
        return { ok: false, error: githubError_(current) };
      }
      var body = {
        message: 'Update website from the Rentals app',
        content: Utilities.base64Encode(json, Utilities.Charset.UTF_8),
        branch: WEBSITE_GITHUB_BRANCH
      };
      if (sha) body.sha = sha;
      var put = githubRequest_('put', token, '', body);
      if (put.code === 200 || put.code === 201) {
        return { ok: true, message: 'Saved. The website will update in about a minute.' };
      }
      if (put.code !== 409 && put.code !== 422) {
        return { ok: false, error: githubError_(put) };
      }
      // 409/422: the file changed on GitHub in the meantime; read it again and retry once.
    }
    return { ok: false, error: 'Website not updated: GitHub was busy. Please press Save again.' };
  } catch (e) {
    return { ok: false, error: 'Website not updated: ' + (e && e.message ? e.message : String(e)) };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/** Called by the app's Website tab (after photo changes, or Save with nothing else changed). */
function publishSite(token) {
  check_(token);
  return publishWebsite();
}

/**
 * Run this once from the editor (choose it in the toolbar, press Run, allow permissions).
 * It switches on the nightly website save and updates the website right away.
 */
function setupWebsite() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyWebsiteSave') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyWebsiteSave').timeBased().everyDays(1).atHour(WEBSITE_DAILY_HOUR).create();
  Logger.log('Nightly website save switched on (runs between ' + WEBSITE_DAILY_HOUR + ' and ' + (WEBSITE_DAILY_HOUR + 1) + ' AM).');
  var result = publishWebsite();
  Logger.log(JSON.stringify(result));
  return result;
}

/** The nightly save. If it fails, Google e-mails you the reason. */
function dailyWebsiteSave() {
  var result = publishWebsite();
  Logger.log(JSON.stringify(result));
  if (!result.ok) throw new Error(result.error);
}

/** The website's data, built with the same rules the app uses (siteFeed_). Only the fields the website uses. */
function websiteData_() {
  var feed = siteFeed_();
  if (!feed || feed.ok === false || !Array.isArray(feed.rooms)) {
    throw new Error('the room list could not be built' + (feed && feed.error ? ' (' + feed.error + ')' : '') + '.');
  }

  var wording = {};
  if (feed.wording && typeof feed.wording === 'object') {
    Object.keys(feed.wording).sort().forEach(function (key) {
      var k = websiteText_(key);
      var v = websiteText_(feed.wording[key]);
      if (k && v) wording[k] = v;
    });
  }

  var rooms = [];
  feed.rooms.forEach(function (r) {
    if (!r || !websiteText_(r.room)) return;
    var price = r.price;
    rooms.push({
      room: websiteText_(r.room),
      price: typeof price === 'number' ? price : websiteText_(price),
      description: websiteText_(r.description),
      availableNow: r.availableNow === true || websiteText_(r.availableNow).toLowerCase() === 'true',
      availableFrom: websiteText_(r.availableFrom),
      availableText: websiteText_(r.availableText),
      photos: Array.isArray(r.photos) ? r.photos.map(websiteText_).filter(function (p) { return p; }) : []
    });
  });

  return {
    landlord: websiteText_(feed.landlord),
    phone: websiteText_(feed.phone),
    email: websiteText_(feed.email),
    address: websiteText_(feed.address),
    rooms: rooms,
    wording: wording
  };
}

function websiteText_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function githubRequest_(method, token, query, payload) {
  var options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  var url = 'https://api.github.com/repos/' + WEBSITE_GITHUB_REPO + '/contents/' + WEBSITE_DATA_PATH + (query || '');
  var res = UrlFetchApp.fetch(url, options);
  var body = null;
  try { body = JSON.parse(res.getContentText()); } catch (ignore) {}
  return { code: res.getResponseCode(), body: body };
}

function githubError_(r) {
  if (r.code === 401) {
    return 'Website not updated: the GitHub key is wrong or has expired. Make a new key and replace GITHUB_TOKEN.';
  }
  if (r.code === 403 || r.code === 404) {
    return 'Website not updated: the GitHub key may not change the collegequarters repository (it needs Contents: Read and write).';
  }
  return 'Website not updated: GitHub answered ' + r.code + (r.body && r.body.message ? ' (' + r.body.message + ')' : '') + '.';
}
