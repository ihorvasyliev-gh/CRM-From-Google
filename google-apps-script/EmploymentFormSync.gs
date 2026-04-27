// ==========================================
// EMPLOYMENT STATUS FORM → SUPABASE
// ==========================================
// Standalone script for the Employment Status Google Form.
// Lives in its OWN Google Sheets project (separate from CRM Code.gs).
//
// Google Form Structure (columns in linked Sheet):
//   A: Timestamp
//   B: Your Email Address
//   C: Are you currently working? ("Yes" / "No")
//   D: Since when? (Date, DD-MM-YYYY — only if "Yes")
//   E: In what field / sector? (Text — only if "Yes")
//   F: Employment type ("Full-Time" / "Part-Time" / "Other" — only if "Yes")
//
// Supabase RPC: submit_employment_status(
//   p_email TEXT,
//   p_is_working BOOLEAN,
//   p_started_month TEXT DEFAULT NULL,    -- 'YYYY-MM'
//   p_field TEXT DEFAULT NULL,
//   p_employment_type TEXT DEFAULT NULL,   -- 'full_time', 'part_time', 'other'
//   p_responded_at TIMESTAMPTZ DEFAULT now()  -- Form submission timestamp
// )
// ==========================================

// ── Configuration ───────────────────────────────────────────────
// Set your credentials in: Project Settings → Script Properties
//   SUPABASE_URL = https://your-project.supabase.co
//   SUPABASE_KEY = your-service-role-key

function getConfig_() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL') || '';
  var key = props.getProperty('SUPABASE_KEY') || '';
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY must be set in Script Properties.');
  }
  return { url: url, key: key };
}

var EMPLOYMENT_FORM_SHEET = 'Form Responses 1';

/**
 * Checks if a sheet name looks like the employment form responses sheet.
 * Handles variants: 'Form Responses 1', 'Form_Responses', 'Form Responses', etc.
 */
function isEmploymentFormSheet_(name) {
  if (!name) return false;
  var normalized = name.toLowerCase().replace(/[_\s]+/g, ' ').trim();
  return normalized === 'form responses 1' ||
         normalized === 'form responses' ||
         normalized === 'form_responses';
}

// Retry settings
var MAX_RETRIES = 3;
var RETRY_BASE_DELAY_MS = 1000;

// ==========================================
// MENU
// ==========================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📋 Employment Sync')
    .addItem('⬆️ Sync ALL responses to Supabase', 'syncAllEmploymentResponses')
    .addSeparator()
    .addItem('🛠 Setup auto-trigger', 'setupEmploymentFormTrigger')
    .addToUi();
}

// ==========================================
// TRIGGER HANDLER
// ==========================================

/**
 * Triggered automatically on each Google Form submission.
 * Reads the new row and sends it to Supabase via RPC.
 */
function onEmploymentFormSubmit(e) {
  try {
    Logger.log('=== onEmploymentFormSubmit TRIGGERED ===');
    Logger.log('Event object keys: ' + (e ? Object.keys(e).join(', ') : 'NULL'));

    var sheet, row;

    if (e && e.range) {
      sheet = e.range.getSheet();
      row = e.range.getRow();
      Logger.log('Event sheet: "' + sheet.getName() + '", row: ' + row);

      if (!isEmploymentFormSheet_(sheet.getName())) {
        Logger.log('Sheet name "' + sheet.getName() + '" does not match expected form responses sheet. Skipping.');
        return;
      }
    } else {
      // Fallback: event object might be missing range (known Google bug).
      // Try to find the form responses sheet and process its last row.
      Logger.log('No event range — using fallback (last row of form sheet)');
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      sheet = findFormSheet_(ss);
      if (!sheet) {
        Logger.log('Could not find form responses sheet in spreadsheet.');
        return;
      }
      row = sheet.getLastRow();
      if (row < 2) {
        Logger.log('No data rows found in sheet.');
        return;
      }
      Logger.log('Fallback: processing last row ' + row + ' of "' + sheet.getName() + '"');
    }

    var result = processEmploymentRow_(sheet, row);

    if (result === true) {
      Logger.log('Row ' + row + ': ✅ successfully synced to Supabase');
    } else if (result === false) {
      Logger.log('Row ' + row + ': ❌ failed to sync to Supabase');
    } else {
      Logger.log('Row ' + row + ': ⏭ skipped');
    }
  } catch (err) {
    Logger.log('onEmploymentFormSubmit ERROR: ' + err + '\nStack: ' + (err.stack || ''));
  }
}

/**
 * Finds the form responses sheet by trying common name variants.
 */
function findFormSheet_(ss) {
  var candidates = ['Form Responses 1', 'Form_Responses', 'Form Responses'];
  for (var i = 0; i < candidates.length; i++) {
    var s = ss.getSheetByName(candidates[i]);
    if (s) return s;
  }
  // Last resort: check all sheets
  var all = ss.getSheets();
  for (var j = 0; j < all.length; j++) {
    if (isEmploymentFormSheet_(all[j].getName())) return all[j];
  }
  return null;
}

// ==========================================
// BULK SYNC (manual)
// ==========================================

/**
 * Process ALL rows in the sheet. Useful for backfilling
 * or re-syncing after errors.
 */
function syncAllEmploymentResponses() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = findFormSheet_(ss);
  if (!sheet) {
    ss.toast('Could not find a form responses sheet (tried several name variants).', 'Error');
    return;
  }
  Logger.log('syncAll: using sheet "' + sheet.getName() + '"');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ss.toast('No responses to sync.', 'Employment Sync');
    return;
  }

  var successCount = 0;
  var errorCount = 0;
  var skippedCount = 0;

  for (var row = 2; row <= lastRow; row++) {
    var result = processEmploymentRow_(sheet, row);
    if (result === true) successCount++;
    else if (result === false) errorCount++;
    else skippedCount++;
  }

  ss.toast(
    '✅ ' + successCount + ' synced | ❌ ' + errorCount + ' errors | ⏭ ' + skippedCount + ' skipped',
    'Employment Sync Complete'
  );
}

// ==========================================
// CORE LOGIC
// ==========================================

/**
 * Processes a single row from the Employment Form sheet.
 * @param {Sheet} sheet
 * @param {number} row - 1-indexed row number (data starts at 2).
 * @returns {boolean|null} true=success, false=error, null=skipped.
 */
function processEmploymentRow_(sheet, row) {
  var numCols = sheet.getLastColumn();
  var values = sheet.getRange(row, 1, 1, numCols).getValues()[0];

  // Column mapping (0-indexed):
  // 0 = Timestamp
  // 1 = Email
  // 2 = Are you currently working?
  // 3 = Since when? (Date)
  // 4 = In what field / sector?
  // 5 = Employment type

  var email = String(values[1] || '').trim();
  if (!email) {
    Logger.log('Row ' + row + ': empty email, skipping');
    return null;
  }

  var isWorkingRaw = String(values[2] || '').trim();
  var isWorking = (isWorkingRaw.toLowerCase() === 'yes');

  // Form submission timestamp (column A)
  var timestamp = values[0];
  var respondedAt = formatIsoDateTime_(timestamp);

  // Build RPC payload
  var payload = {
    p_email: email,
    p_is_working: isWorking,
    p_responded_at: respondedAt
  };

  // Conditional fields (only filled when "Yes")
  if (isWorking) {
    var sinceWhen = values[3];
    if (sinceWhen) {
      payload.p_started_month = parseDateToYearMonth_(sinceWhen);
    }

    var fieldOfWork = String(values[4] || '').trim();
    if (fieldOfWork) {
      payload.p_field = fieldOfWork;
    }

    var empType = String(values[5] || '').trim();
    if (empType) {
      payload.p_employment_type = normalizeEmploymentType_(empType);
    }
  }

  Logger.log('Row ' + row + ' → payload: ' + JSON.stringify(payload));

  // Call Supabase RPC
  var result = _fetch('rpc/submit_employment_status', 'post', payload);

  if (result === null) {
    Logger.log('Row ' + row + ': RPC call failed (null response)');
    return false;
  }

  // RPC returns { success: bool, message: string }
  if (result.success === false) {
    Logger.log('Row ' + row + ': ❌ ' + result.message);
    return false;
  }

  Logger.log('Row ' + row + ': ✅ ' + (result.message || 'OK'));
  return true;
}

// ==========================================
// DATE & TYPE HELPERS
// ==========================================

/**
 * Converts a date value to 'YYYY-MM' format for the DB.
 * Handles: Date objects, DD-MM-YYYY, DD/MM/YYYY, ISO strings.
 */
function parseDateToYearMonth_(dateVal) {
  if (!dateVal) return null;

  try {
    // Date object (most common from Google Forms)
    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
      return Utilities.formatDate(dateVal, Session.getScriptTimeZone(), 'yyyy-MM');
    }

    var str = String(dateVal).trim();

    // DD-MM-YYYY or DD/MM/YYYY
    var ddmmyyyy = str.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})$/);
    if (ddmmyyyy) {
      var month = ddmmyyyy[2].length === 1 ? '0' + ddmmyyyy[2] : ddmmyyyy[2];
      return ddmmyyyy[3] + '-' + month;
    }

    // YYYY-MM-DD (ISO)
    var iso = str.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})$/);
    if (iso) {
      var month2 = iso[2].length === 1 ? '0' + iso[2] : iso[2];
      return iso[1] + '-' + month2;
    }

    // Last resort: native Date parsing
    var d = new Date(str);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
    }
  } catch (e) {
    Logger.log('parseDateToYearMonth_ error for "' + dateVal + '": ' + e);
  }

  return null;
}

/**
 * Normalizes employment type from form radio values to DB format.
 * "Full-Time" → "full_time", "Part-Time" → "part_time", "Other" → "other"
 */
function normalizeEmploymentType_(raw) {
  if (!raw) return '';

  var lower = raw.toLowerCase().trim();

  if (lower === 'full-time' || lower === 'full time' || lower === 'fulltime') {
    return 'full_time';
  }
  if (lower === 'part-time' || lower === 'part time' || lower === 'parttime') {
    return 'part_time';
  }

  return lower; // "other" or anything else → as-is
}

/**
 * Converts a Google Sheets date/datetime to ISO 8601 string for Supabase.
 * Falls back to current time if unparseable.
 * @param {Date|string} dateObj
 * @returns {string} ISO datetime string.
 */
function formatIsoDateTime_(dateObj) {
  if (!dateObj || String(dateObj).trim() === '') return new Date().toISOString();

  try {
    if (dateObj instanceof Date) {
      if (!isNaN(dateObj.getTime())) return dateObj.toISOString();
      return new Date().toISOString();
    }
    var d = new Date(dateObj);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch (e) {
    Logger.log('formatIsoDateTime_ error: ' + e);
  }

  return new Date().toISOString();
}

// ==========================================
// HTTP HELPER (with retry)
// ==========================================

/**
 * Core HTTP helper with exponential backoff retry.
 * Retries on 5xx and network errors, NOT on 4xx.
 */
function _fetch(endpoint, method, payload, extraHeaders) {
  var config = getConfig_();
  var url = config.url + '/rest/v1/' + endpoint;
  var headers = {
    'apikey': config.key,
    'Authorization': 'Bearer ' + config.key,
    'Content-Type': 'application/json'
  };

  if (extraHeaders) {
    for (var k in extraHeaders) headers[k] = extraHeaders[k];
  }

  var options = {
    'method': method,
    'headers': headers,
    'muteHttpExceptions': true
  };

  if (payload) options.payload = JSON.stringify(payload);

  var lastError = null;

  for (var attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, options);
      var code = response.getResponseCode();
      var content = response.getContentText();

      if (code >= 200 && code < 300) {
        return content ? JSON.parse(content) : null;
      }

      // 4xx — client error, don't retry
      if (code >= 400 && code < 500) {
        Logger.log('Client Error [' + method.toUpperCase() + ' ' + endpoint + '] (' + code + '): ' + content);
        return null;
      }

      // 5xx — server error, retry
      lastError = 'HTTP ' + code + ': ' + content;
      Logger.log('Server Error (attempt ' + (attempt + 1) + '/' + MAX_RETRIES + ') [' + method.toUpperCase() + ' ' + endpoint + '] (' + code + '): ' + content.substring(0, 200));

    } catch (networkErr) {
      lastError = String(networkErr);
      Logger.log('Network Error (attempt ' + (attempt + 1) + '/' + MAX_RETRIES + ') [' + method.toUpperCase() + ' ' + endpoint + ']: ' + lastError.substring(0, 200));
    }

    // Exponential backoff: 1s, 2s, 4s
    if (attempt < MAX_RETRIES - 1) {
      Utilities.sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }

  Logger.log('All ' + MAX_RETRIES + ' retries exhausted for [' + method.toUpperCase() + ' ' + endpoint + ']. Last error: ' + lastError);
  return null;
}

// ==========================================
// TRIGGER SETUP
// ==========================================

/**
 * Installs the onFormSubmit trigger. Run once manually.
 */
function setupEmploymentFormTrigger() {
  // Remove existing triggers for this handler to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onEmploymentFormSubmit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('onEmploymentFormSubmit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onFormSubmit()
    .create();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Employment Form trigger installed!',
    'Setup ✅'
  );
}
