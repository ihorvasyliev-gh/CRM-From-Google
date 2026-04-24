// ==========================================
// CONFIGURATION
// To set your credentials, go to:
// Project Settings → Script Properties → Add:
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

var BATCH_SIZE = 50; 
var FIXED_COL_COUNT = 8; // Индекс, с которого начинаются колонки курсов (индекс 8 = 9-я колонка)

var SOURCE_SHEET_NAME = 'Form responses 1'; // Откуда берем данные для Supabase
var MIRROR_SHEET_NAME = 'CRM Mirror';       // Куда выгружаем данные из Supabase

// Limits for execution
var MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 minutes in milliseconds
var START_TIME = Date.now();

// Retry settings for API calls
var MAX_RETRIES = 3;
var RETRY_BASE_DELAY_MS = 1000; // 1 second base, doubles on each retry

// Global cache for Course Name -> ID mapping
var COURSE_CACHE = {}; 

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔄 CRM Sync')
    .addItem('⬆️ Export ALL answers to Supabase', 'startFullSync')
    .addItem('⬆️ Upload the last 20 to Supabase', 'syncAllRecent')
    .addSeparator()
    .addItem('⬇️ Upload from Supabase to CRM Mirror', 'syncFromSupabase')
    .addSeparator()
    .addItem('🛠 RESTORE: Recover Statuses from CRM Backup', 'restoreDataFromBackup')
    .addSeparator()
    .addItem('🛠 Migrate Registration Dates (One-time)', 'startMigrateRegistrationDates')
    .addSeparator()
    .addItem('🛠 Settings: Triggers (Automation)', 'setupTriggers')
    .addItem('🛠 Configuration: Formatting CRM Mirror', 'setupMirrorSheetFormatting')
    .addToUi();
}

// ==========================================
// FORM → SUPABASE (Upload)
// ==========================================

/**
 * Triggered on Form Submit. Syncs just the new row.
 */
function onFormSubmit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    
    // Строго проверяем, что форма отправилась на правильный лист
    if (sheet.getName() !== SOURCE_SHEET_NAME) return;
    
    // Pre-load course cache to avoid duplicate creation on API failures
    warmUpCourseCache();
    
    var row = e.range.getRow();
    syncRowsRange(sheet, row, row);
  } catch (err) {
    Logger.log('onFormSubmit error: ' + err);
  }
}

/**
 * Triggers periodically. Syncs recent entries.
 */
function syncAllRecent() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SOURCE_SHEET_NAME);
  if (!sheet) {
    ss.toast('Лист ' + SOURCE_SHEET_NAME + ' не найден.', 'Ошибка');
    return;
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var startRow = Math.max(2, lastRow - 20); 
  syncRowsRange(sheet, startRow, lastRow);
  ss.toast('The last lines have been uploaded!', 'CRM Sync');
}

/**
 * Entry point for full sync to reset properties.
 */
function startFullSync() {
  PropertiesService.getScriptProperties().deleteProperty('SYNC_START_ROW');
  syncAllRowsBatched();
}

/**
 * Resume function for the time-based trigger.
 */
function resumeSyncAllRowsBatched(e) {
  // Clean up the trigger that launched us
  if (e && e.triggerUid) {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getUniqueId() === e.triggerUid) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
  }
  syncAllRowsBatched();
}

/**
 * Manual/Resumable Trigger. Syncs ALL rows in batches safely.
 */
function syncAllRowsBatched() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SOURCE_SHEET_NAME);
  
  if (!sheet) {
    ss.toast('Лист ' + SOURCE_SHEET_NAME + ' не найден.', 'Ошибка');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ss.toast('No data to download.', 'CRM Sync');
    return;
  }
  
  var scriptProps = PropertiesService.getScriptProperties();
  var savedRow = scriptProps.getProperty('SYNC_START_ROW');
  var startRow = savedRow ? parseInt(savedRow, 10) : 2;

  if (startRow === 2) {
    ss.toast('Starting full sync.', 'CRM Sync');
  } else {
    ss.toast('Resume sync from line ' + startRow + '...', 'CRM Sync');
  }
  
  warmUpCourseCache();

  var failedBatches = 0;
  var MAX_CONSECUTIVE_FAILURES = 3;

  for (var r = startRow; r <= lastRow; r += BATCH_SIZE) {
    // 1. CHECK TIME LIMIT
    if (Date.now() - START_TIME > MAX_EXECUTION_TIME) {
      scriptProps.setProperty('SYNC_START_ROW', r.toString());
      
      ScriptApp.newTrigger('resumeSyncAllRowsBatched')
        .timeBased()
        .after(60 * 1000) // Resume in 1 minute
        .create();
        
      ss.toast('Pause on line ' + r + ' — will continue in 1 min', 'CRM Sync Pause');
      return; 
    }

    var endRow = Math.min(r + BATCH_SIZE - 1, lastRow);
    try {
      syncRowsRange(sheet, r, endRow);
      ss.toast('Lines ' + r + ' – ' + endRow + ' of ' + lastRow, 'CRM Sync');
      failedBatches = 0; // reset on success
      Utilities.sleep(500); 
    } catch (err) {
      failedBatches++;
      Logger.log("Error syncing batch " + r + "-" + endRow + ": " + err);
      ss.toast('Error on line ' + r + ': ' + String(err).substring(0, 80), 'CRM Sync Error');
      
      // If too many consecutive failures, pause and resume later
      if (failedBatches >= MAX_CONSECUTIVE_FAILURES) {
        scriptProps.setProperty('SYNC_START_ROW', r.toString());
        ScriptApp.newTrigger('resumeSyncAllRowsBatched')
          .timeBased()
          .after(2 * 60 * 1000) // Wait 2 minutes before retrying
          .create();
        ss.toast('Too many errors. Pausing at line ' + r + ', will retry in 2 min.', 'CRM Sync Error');
        return;
      }
    }
  }
  
  scriptProps.deleteProperty('SYNC_START_ROW');
  ss.toast('Finished! All ' + lastRow + ' rows synced.', 'CRM Sync ✅');
}

/**
 * Core Logic: Syncs a range of rows using Batch Upserts
 */
function syncRowsRange(sheet, startRow, endRow) {
  if (startRow > endRow) return;
  
  var numRows = endRow - startRow + 1;
  var numCols = sheet.getLastColumn();
  if (numCols < FIXED_COL_COUNT) return;

  var rangeValues = sheet.getRange(startRow, 1, numRows, numCols).getValues();
  var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
  
  var studentsToUpsert = [];
  var rowMap = []; 

  for (var i = 0; i < rangeValues.length; i++) {
    var rowData = rangeValues[i];
    var email = rowData[4];
    
    if (!email || String(email).trim() === "") continue;

    var fName = String(rowData[1] || "").trim();
    var lName = String(rowData[2] || "").trim();
    var eMail = String(email).trim().toLowerCase();

    studentsToUpsert.push({
      first_name: fName,
      last_name: lName,
      phone: normalizePhone(rowData[3]),
      email: eMail, 
      address: rowData[5] || "",
      eircode: rowData[6] || "",
      dob: formatDate(rowData[7]),
      last_synced_at: new Date().toISOString(),
      created_at: formatIsoDateTime(rowData[0])
    });
    
    // Use a composite key for the map instead of just email
    rowMap.push({ key: fName.toLowerCase() + "|" + lName.toLowerCase() + "|" + eMail, rowData: rowData });
  }

  if (studentsToUpsert.length === 0) return;

  // Deduplicate within the batch before sending to Supabase
  var uniqueStudents = [];
  var seenKeys = {};
  for (var k = 0; k < studentsToUpsert.length; k++) {
      var s = studentsToUpsert[k];
      var key = s.first_name.toLowerCase() + "|" + s.last_name.toLowerCase() + "|" + s.email;
      if (!seenKeys[key]) {
          uniqueStudents.push(s);
          seenKeys[key] = true;
      }
  }

  // Upsert Students
  var upsertedStudents = _fetch('students?on_conflict=first_name,last_name,email', 'post', uniqueStudents, { 
    'Prefer': 'resolution=merge-duplicates, return=representation' 
  });
  
  if (!upsertedStudents) throw new Error("Failed to upsert students batch.");
  
  var keyToIdMap = {};
  for (var k = 0; k < upsertedStudents.length; k++) {
      var s = upsertedStudents[k];
      var key = String(s.first_name || "").toLowerCase() + "|" + String(s.last_name || "").toLowerCase() + "|" + String(s.email || "").toLowerCase();
      keyToIdMap[key] = s.id;
  }

  // Build Enrollments
  var enrollmentsToUpsert = [];
  var enrollmentKeys = {};
  
  for (var m = 0; m < rowMap.length; m++) {
      var mapItem = rowMap[m];
      var sId = keyToIdMap[mapItem.key];
      if (!sId) continue; 

      var rData = mapItem.rowData;

      for (var col = FIXED_COL_COUNT; col < headers.length; col++) {
          var courseName = headers[col];
          var cellValue = rData[col];
          
          if (courseName && cellValue && String(cellValue).trim() !== "") {
              var cId = getCourseId(courseName); 
              if (cId) {
                  var variants = String(cellValue).split(',').map(function(s) { return s.trim(); });
                  for (var v = 0; v < variants.length; v++) {
                       if (!variants[v]) continue; // skip empty variants
                       var uniqueKey = sId + "_" + cId + "_" + variants[v]; 
                       if (!enrollmentKeys[uniqueKey]) {
                           enrollmentsToUpsert.push({
                               student_id: sId,
                               course_id: cId,
                               course_variant: variants[v],
                               status: 'requested',
                               created_at: formatIsoDateTime(rData[0])
                           });
                           enrollmentKeys[uniqueKey] = true;
                       }
                  }
              }
          }
      }
  }

  // Upsert Enrollments (ignores duplicates to keep existing statuses intact)
  if (enrollmentsToUpsert.length > 0) {
      _fetch('enrollments?on_conflict=student_id,course_id,course_variant', 'post', enrollmentsToUpsert, { 
        'Prefer': 'resolution=ignore-duplicates' 
      });
  }
}

// ==========================================
// API HELPERS (with retry & resilience)
// ==========================================

/**
 * Fetches all rows from a Supabase table using range-based pagination.
 * Handles tables with >1000 rows automatically.
 */
function _fetchAll(endpoint, selectQuery) {
  var allData = [];
  var limit = 1000;
  var offset = 0;
  var hasMore = true;
  var emptyPages = 0;

  while (hasMore) {
    var rangeHeader = offset + "-" + (offset + limit - 1);
    var res = _fetch(endpoint + '?' + selectQuery, 'get', null, { 
      'Range-Unit': 'items', 
      'Range': rangeHeader 
    });

    if (res && res.length > 0) {
      allData = allData.concat(res);
      offset += limit;
      emptyPages = 0;
      if (res.length < limit) hasMore = false;
    } else {
      emptyPages++;
      // Protect against infinite loop on API issues
      if (emptyPages >= 2) hasMore = false;
      else hasMore = false;
    }
  }
  return allData;
}

/**
 * Aggressively normalizes a course name to prevent duplicates.
 * - Converts to string
 * - Replaces ALL whitespace types (\n, \r, \t, non-breaking space U+00A0, zero-width chars) with regular space
 * - Collapses multiple spaces into one
 * - Trims leading/trailing whitespace
 */
function normalizeCourseName_(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF\r\n\t]+/g, ' ')  // all whitespace → single space
    .replace(/ {2,}/g, ' ')                                        // collapse multiples
    .trim();
}

function warmUpCourseCache() {
  var allCourses = _fetchAll('courses', 'select=id,name');
  if (allCourses) {
    for (var i = 0; i < allCourses.length; i++) {
        var normalized = normalizeCourseName_(allCourses[i].name);
        // Store by both the normalized AND original name for maximum hit rate
        COURSE_CACHE[normalized] = allCourses[i].id;
        COURSE_CACHE[allCourses[i].name] = allCourses[i].id;
    }
  }
}

/**
 * Gets a course ID by name. Lookup order:
 * 1. In-memory cache (normalized key)
 * 2. Supabase exact match
 * 3. Supabase case-insensitive search (ilike)
 * 4. Creates new course ONLY if search returned [] (confirmed empty), NEVER on null (API error)
 *
 * CRITICAL: _fetch returns [] for "no results" and null for "API error".
 * We must NEVER create a new course when searches errored out — that causes duplicates.
 */
function getCourseId(name) {
  var normalized = normalizeCourseName_(name);
  if (!normalized) return null;
  
  // 1. Check cache (fastest path — no API call needed)
  if (COURSE_CACHE[normalized]) return COURSE_CACHE[normalized];
  
  // 2. Exact match in Supabase
  var res = _fetch('courses?name=eq.' + encodeURIComponent(normalized), 'get');
  if (res && res.length > 0) {
      COURSE_CACHE[normalized] = res[0].id;
      return res[0].id;
  }
  
  // If res is null → API error. Do NOT proceed to create.
  if (res === null) {
    Logger.log('ERROR: API failed looking up course "' + normalized + '". Refusing to create to prevent duplicates.');
    return null;
  }
  
  // 3. Fuzzy match: case-insensitive search (catches case differences)
  var fuzzyRes = _fetch('courses?name=ilike.' + encodeURIComponent(normalized), 'get');
  if (fuzzyRes && fuzzyRes.length > 0) {
      COURSE_CACHE[normalized] = fuzzyRes[0].id;
      Logger.log('Fuzzy-matched course "' + normalized + '" → existing "' + fuzzyRes[0].name + '" (id: ' + fuzzyRes[0].id + ')');
      return fuzzyRes[0].id;
  }
  
  // If fuzzyRes is null → API error. Do NOT proceed to create.
  if (fuzzyRes === null) {
    Logger.log('ERROR: API failed on ilike lookup for course "' + normalized + '". Refusing to create to prevent duplicates.');
    return null;
  }
  
  // 4. Both searches returned [] (confirmed no match) — safe to create
  Logger.log('Creating NEW course: "' + normalized + '" (no existing match found)');
  var newCourse = _fetch('courses', 'post', { name: normalized }, { 'Prefer': 'return=representation' });
  var id = newCourse && newCourse.length > 0 ? newCourse[0].id : null;
  if (id) {
    COURSE_CACHE[normalized] = id;
  }
  return id;
}

/**
 * Core HTTP helper with exponential backoff retry.
 * Retries on 5xx errors and network failures, NOT on 4xx client errors.
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
    'method' : method,
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
      
      // 4xx errors — don't retry, it's a client error
      if (code >= 400 && code < 500) {
        Logger.log("Supabase Client Error [" + method.toUpperCase() + " " + endpoint + "] (" + code + "): " + content);
        return null;
      }
      
      // 5xx errors — retry after delay
      lastError = "HTTP " + code + ": " + content;
      Logger.log("Supabase Server Error (attempt " + (attempt + 1) + "/" + MAX_RETRIES + ") [" + method.toUpperCase() + " " + endpoint + "] (" + code + "): " + content.substring(0, 200));
      
    } catch (networkErr) {
      lastError = String(networkErr);
      Logger.log("Network Error (attempt " + (attempt + 1) + "/" + MAX_RETRIES + ") [" + method.toUpperCase() + " " + endpoint + "]: " + lastError.substring(0, 200));
    }
    
    // Exponential backoff: 1s, 2s, 4s
    if (attempt < MAX_RETRIES - 1) {
      Utilities.sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }
  
  Logger.log("All " + MAX_RETRIES + " retries exhausted for [" + method.toUpperCase() + " " + endpoint + "]. Last error: " + lastError);
  return null;
}

// ==========================================
// DATA FORMATTERS
// ==========================================

function formatDate(dateObj) {
  if (!dateObj || String(dateObj).trim() === "") return null;
  if (typeof dateObj === 'string') {
    // Validate it looks like a date
    var d = new Date(dateObj);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
    return dateObj;
  }
  try {
    return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy-MM-dd");
  } catch (e) {
    return null;
  }
}

/**
 * Helper to convert Google Sheets date to ISO String for Supabase.
 * Falls back to current time if the value can't be parsed.
 */
function formatIsoDateTime(dateObj) {
  if (!dateObj || String(dateObj).trim() === "") return new Date().toISOString();
  
  try {
    if (dateObj instanceof Date) {
      if (!isNaN(dateObj.getTime())) return dateObj.toISOString();
      return new Date().toISOString();
    }
    var d = new Date(dateObj);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch (e) {
    Logger.log("Error formatting ISO date: " + e);
  }
  
  return new Date().toISOString();
}

/**
 * Formats a date/datetime string for Sheet output (dd/MM/yyyy).
 */
function formatDateForSheet(dateString) {
  if (!dateString || String(dateString).trim() === "") return "";
  try {
    var d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
  } catch (e) {
    return String(dateString);
  }
}

function normalizePhone(phone) {
  if (!phone) return "";
  var cleaned = String(phone).replace(/[^\d+]/g, '');
  if (!cleaned) return "";

  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.substring(2);

  if (cleaned.startsWith('353')) return '+' + cleaned;
  if (cleaned.startsWith('380')) return '+' + cleaned;
  if (cleaned.startsWith('44')) return '+' + cleaned;

  if (cleaned.startsWith('8') && cleaned.length === 9) return '+353' + cleaned;
  if (cleaned.startsWith('08')) return '+353' + cleaned.substring(1);
  if (cleaned.startsWith('07') && cleaned.length === 11) return '+44' + cleaned.substring(1);

  var uaCodes = ['050', '066', '095', '099', '067', '068', '096', '097', '098', '063', '073', '093', '091', '092', '094'];
  for (var i = 0; i < uaCodes.length; i++) {
    if (cleaned.startsWith(uaCodes[i]) && cleaned.length === 10) {
      return '+38' + cleaned;
    }
  }

  if (cleaned.startsWith('0')) return '+353' + cleaned.substring(1);
  if (cleaned.length >= 10) return '+' + cleaned;

  return cleaned;
}

// ==========================================
// MIRROR SYNC (SUPABASE → GOOGLE SHEETS)
// ==========================================

/**
 * Syncs data from Supabase to CRM Mirror sheet.
 * Pulls ALL data: students, enrollments (with courses), and student_flags.
 * Builds a comprehensive mirror with proper formatting and flags.
 */
function syncFromSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MIRROR_SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(MIRROR_SHEET_NAME);
  }
  
  ss.toast("Downloading data from Supabase...", "CRM Mirror Sync");
  
  // ── 1. Fetch all data in parallel-safe order ──────────────────
  var students = _fetchAll('students', 'select=*');
  if (!students) {
    ss.toast("Failed to fetch students. Check logs.", "CRM Mirror Sync Error");
    return;
  }
  
  var enrollments = _fetchAll('enrollments', 'select=*,course:courses(name)');
  if (!enrollments) {
    ss.toast("Failed to fetch enrollments. Check logs.", "CRM Mirror Sync Error");
    return;
  }
  
  // Fetch student flags with course names for display
  var studentFlags = _fetchAll('student_flags', 'select=*,courses(name)');
  if (!studentFlags) studentFlags = []; // Non-critical, continue without flags
  
  ss.toast("Processing " + students.length + " students, " + enrollments.length + " enrollments, " + studentFlags.length + " flags...", "CRM Mirror Sync");
  
  // ── 2. Build lookup maps ──────────────────────────────────────
  var studentMap = {};
  var enrolledStudentIds = {};
  for (var i = 0; i < students.length; i++) {
    studentMap[students[i].id] = students[i];
  }
  
  // Build student_id → flags[] map
  var flagsByStudent = {};
  for (var f = 0; f < studentFlags.length; f++) {
    var flag = studentFlags[f];
    var sid = flag.student_id;
    if (!flagsByStudent[sid]) flagsByStudent[sid] = [];
    flagsByStudent[sid].push(flag);
  }
  
  // ── 3. Define output headers ──────────────────────────────────
  var headers = [
    'System ID',          // A (hidden)
    'Enrollment ID',      // B (hidden)
    'Student ID',         // C (hidden)
    'Status',             // D
    'Priority',           // E
    'Flags',              // F  ← NEW: student flags summary
    'First Name',         // G
    'Last Name',          // H
    'Email',              // I
    'Mobile',             // J
    'Address',            // K
    'Eircode',            // L
    'DOB',                // M
    'Course',             // N
    'Variant / Language', // O
    'Invited Date',       // P
    'Confirmed Date',     // Q
    'Completed Date',     // R ← NEW
    'Created At',         // S
    'Notes'               // T
  ];
  
  var outputRows = [];
  
  // ── 4. Sort enrollments: Course Name → newest first ───────────
  enrollments.sort(function(a, b) {
    var aName = (a.course && a.course.name) ? a.course.name : "";
    var bName = (b.course && b.course.name) ? b.course.name : "";
    if (aName !== bName) return aName.localeCompare(bName);
    return (b.created_at || "").localeCompare(a.created_at || "");
  });

  // ── 5. Build enrollment rows ──────────────────────────────────
  for (var i = 0; i < enrollments.length; i++) {
    var e = enrollments[i];
    var s = studentMap[e.student_id] || {};
    var cName = (e.course && e.course.name) ? e.course.name : "Unknown Course";
    
    enrolledStudentIds[e.student_id] = true;
    
    // Build flags summary string for this student
    var flagsSummary = buildFlagsSummary_(flagsByStudent[e.student_id]);
    
    outputRows.push([
      e.id + "_" + e.student_id,                                // System ID
      e.id,                                                      // Enrollment ID
      e.student_id,                                               // Student ID
      String(e.status || 'requested').toUpperCase(),              // Status
      e.is_priority ? "⭐ High" : "Normal",                      // Priority
      flagsSummary,                                               // Flags
      s.first_name || "",                                         // First Name
      s.last_name || "",                                          // Last Name
      s.email || "",                                              // Email
      s.phone || "",                                              // Mobile
      s.address || "",                                            // Address
      s.eircode || "",                                            // Eircode
      formatDateForSheet(s.dob),                                  // DOB
      cName,                                                      // Course
      e.course_variant || "Standard",                             // Variant
      formatDateForSheet(e.invited_date),                         // Invited Date
      formatDateForSheet(e.confirmed_date),                       // Confirmed Date
      formatDateForSheet(e.completed_date),                       // Completed Date
      formatDateForSheet(e.created_at),                           // Created At
      e.notes || ""                                               // Notes
    ]);
  }
  
  // ── 6. Add students with no enrollments ───────────────────────
  for (var i = 0; i < students.length; i++) {
    if (!enrolledStudentIds[students[i].id]) {
      var s = students[i];
      var flagsSummary = buildFlagsSummary_(flagsByStudent[s.id]);
      
      outputRows.push([
        "no_enr_" + s.id,                          // System ID
        "",                                          // Enrollment ID
        s.id,                                        // Student ID
        'NO ENROLLMENTS',                            // Status
        '',                                          // Priority
        flagsSummary,                                // Flags
        s.first_name || "",                          // First Name
        s.last_name || "",                           // Last Name
        s.email || "",                               // Email
        s.phone || "",                               // Mobile
        s.address || "",                             // Address
        s.eircode || "",                             // Eircode
        formatDateForSheet(s.dob),                   // DOB
        "None",                                      // Course
        "",                                          // Variant
        "",                                          // Invited Date
        "",                                          // Confirmed Date
        "",                                          // Completed Date
        formatDateForSheet(s.created_at),             // Created At
        ""                                           // Notes
      ]);
    }
  }
  
  // ── 7. Write to sheet ─────────────────────────────────────────
  ss.toast("Writing " + outputRows.length + " rows to sheet...", "CRM Mirror Sync");
  
  // Clear old data (row 2+) while preserving header row
  var lastRowCurrent = sheet.getLastRow();
  var lastColCurrent = sheet.getLastColumn();
  if (lastRowCurrent > 1 && lastColCurrent > 0) {
    sheet.getRange(2, 1, lastRowCurrent - 1, Math.max(lastColCurrent, headers.length)).clearContent();
  }
  
  // Write Headers with premium styling
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers])
    .setFontWeight("bold")
    .setFontSize(10)
    .setFontColor("#ffffff")
    .setBackground("#1a237e")          // Deep indigo header
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  sheet.setRowHeight(1, 32);
  
  // Write Data
  if (outputRows.length > 0) {
    var dataRange = sheet.getRange(2, 1, outputRows.length, headers.length);
    dataRange.setValues(outputRows);
    dataRange.setFontSize(10)
      .setVerticalAlignment("middle");
    sheet.setRowHeightsForced(2, outputRows.length, 26);
  }
  
  // ── 8. Apply formatting ───────────────────────────────────────
  applyMirrorFormatting_(sheet, headers.length, outputRows.length);
  
  ss.toast("✅ Sync complete: " + outputRows.length + " rows (" + studentFlags.length + " flags)", "CRM Mirror Sync");
}

/**
 * Builds a human-readable flags summary for a student.
 * @param {Array} flags - Array of student_flag objects, or undefined.
 * @returns {string} e.g. "⚠ SNA Course (didn't pass); Basic English"
 */
function buildFlagsSummary_(flags) {
  if (!flags || flags.length === 0) return "";
  
  var parts = [];
  for (var i = 0; i < flags.length; i++) {
    var f = flags[i];
    var courseName = (f.courses && f.courses.name) ? f.courses.name : "Unknown";
    var part = courseName;
    if (f.comment) part += " — " + f.comment;
    parts.push(part);
  }
  return "⚠ " + parts.join("; ");
}

/**
 * Applies all formatting, conditional formatting, filters, and column settings
 * to the CRM Mirror sheet. Called automatically after each sync.
 */
function applyMirrorFormatting_(sheet, numCols, numDataRows) {
  // ── Column widths (pixels) ────────────────────────────────────
  // A=SystemID, B=EnrID, C=StuID (hidden, keep narrow)
  // D=Status, E=Priority, F=Flags, G=FirstName, H=LastName, I=Email
  // J=Mobile, K=Address, L=Eircode, M=DOB, N=Course, O=Variant
  // P=Invited, Q=Confirmed, R=Completed, S=Created, T=Notes
  try {
    var colWidths = {
       1: 60,    // A: System ID (hidden)
       2: 60,    // B: Enrollment ID (hidden)
       3: 60,    // C: Student ID (hidden)
       4: 115,   // D: Status
       5: 85,    // E: Priority
       6: 200,   // F: Flags
       7: 120,   // G: First Name
       8: 120,   // H: Last Name
       9: 210,   // I: Email
      10: 130,   // J: Mobile
      11: 180,   // K: Address
      12: 80,    // L: Eircode
      13: 95,    // M: DOB
      14: 170,   // N: Course
      15: 120,   // O: Variant
      16: 100,   // P: Invited Date
      17: 110,   // Q: Confirmed Date
      18: 110,   // R: Completed Date
      19: 100,   // S: Created At
      20: 220    // T: Notes
    };
    for (var c in colWidths) {
      sheet.setColumnWidth(parseInt(c), colWidths[c]);
    }
  } catch (cwErr) {
    Logger.log("Column width error (non-critical): " + cwErr);
  }
  
  // ── Date column formats ───────────────────────────────────────
  if (numDataRows > 0) {
    sheet.getRange("M2:M").setNumberFormat("dd/MM/yyyy"); // DOB
    sheet.getRange("P2:P").setNumberFormat("dd/MM/yyyy"); // Invited Date
    sheet.getRange("Q2:Q").setNumberFormat("dd/MM/yyyy"); // Confirmed Date
    sheet.getRange("R2:R").setNumberFormat("dd/MM/yyyy"); // Completed Date
    sheet.getRange("S2:S").setNumberFormat("dd/MM/yyyy"); // Created At
  }
  
  // ── Text alignment ────────────────────────────────────────────
  if (numDataRows > 0) {
    // Center-align: Status, Priority, DOB, Dates, Eircode
    var centerCols = ['D', 'E', 'L', 'M', 'P', 'Q', 'R', 'S'];
    for (var ci = 0; ci < centerCols.length; ci++) {
      sheet.getRange(centerCols[ci] + "2:" + centerCols[ci]).setHorizontalAlignment("center");
    }
    
    // Bold names for readability
    sheet.getRange("G2:G").setFontWeight("bold"); // First Name
    sheet.getRange("H2:H").setFontWeight("bold"); // Last Name
    
    // Wrap text for Flags, Notes, Address (they can be long)
    sheet.getRange("F2:F").setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    sheet.getRange("K2:K").setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    sheet.getRange("T2:T").setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  }
  
  // ── Alternating row banding ───────────────────────────────────
  try {
    // Remove existing bandings to avoid stacking
    var bandings = sheet.getBandings();
    for (var b = 0; b < bandings.length; b++) {
      bandings[b].remove();
    }
    
    if (numDataRows > 0) {
      var bandRange = sheet.getRange(1, 1, numDataRows + 1, numCols);
      bandRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
      // Override banding colors for a cleaner look
      var banding = sheet.getBandings()[0];
      if (banding) {
        banding.setFirstRowColor("#ffffff")
               .setSecondRowColor("#f8f9fa")
               .setHeaderRowColor("#1a237e")
               .setFooterRowColor(null);
      }
    }
  } catch (bandErr) {
    Logger.log("Banding error (non-critical): " + bandErr);
  }
  
  // ── Frozen header ─────────────────────────────────────────────
  sheet.setFrozenRows(1);
  
  // ── Hide system ID columns (A, B, C) ─────────────────────────
  sheet.hideColumns(1); // System ID
  sheet.hideColumns(2); // Enrollment ID 
  sheet.hideColumns(3); // Student ID
  
  // ── Auto-Filter ───────────────────────────────────────────────
  try {
    if (sheet.getFilter() !== null) {
      sheet.getFilter().remove();
    }
    sheet.getRange(1, 1, sheet.getMaxRows(), Math.max(sheet.getLastColumn(), numCols)).createFilter();
  } catch (filterErr) {
    Logger.log("Filter error (non-critical): " + filterErr);
  }
  
  // ── Conditional Formatting ────────────────────────────────────
  try {
    sheet.clearConditionalFormatRules();
    
    var statusRange = sheet.getRange("D2:D");
    var flagsRange = sheet.getRange("F2:F");
    var priorityRange = sheet.getRange("E2:E");
    
    var rules = [];
    
    // Status column (D) — color-coded badges
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('CONFIRMED').setBackground('#c8e6c9').setFontColor('#1b5e20').setBold(true)
      .setRanges([statusRange]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('INVITED').setBackground('#fff9c4').setFontColor('#f57f17').setBold(true)
      .setRanges([statusRange]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('COMPLETED').setBackground('#bbdefb').setFontColor('#0d47a1').setBold(true)
      .setRanges([statusRange]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('WITHDRAWN').setBackground('#ffcdd2').setFontColor('#b71c1c').setBold(true)
      .setRanges([statusRange]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('REQUESTED').setBackground('#e0e0e0').setFontColor('#424242').setBold(false)
      .setRanges([statusRange]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('NO ENROLLMENTS').setBackground('#fafafa').setFontColor('#9e9e9e').setItalic(true)
      .setRanges([statusRange]).build());
    
    // Flags column (F) — orange highlight for flagged students
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextStartsWith('⚠').setBackground('#fff3e0').setFontColor('#e65100').setBold(true)
      .setRanges([flagsRange]).build());
    
    // Priority column (E) — gold for ⭐ High
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains('⭐').setBackground('#fff8e1').setFontColor('#ff8f00').setBold(true)
      .setRanges([priorityRange]).build());
    
    sheet.setConditionalFormatRules(rules);
  } catch (fmtErr) {
    Logger.log("Conditional formatting error (non-critical): " + fmtErr);
  }
}

// ==========================================
// DATES MIGRATION (ONE-TIME)
// ==========================================

function startMigrateRegistrationDates() {
  PropertiesService.getScriptProperties().deleteProperty('MIGRATE_DATES_START_ROW');
  migrateRegistrationDates();
}

function resumeMigrateRegistrationDates(e) {
  if (e && e.triggerUid) {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === 'resumeMigrateRegistrationDates') {
            ScriptApp.deleteTrigger(triggers[i]);
        }
    }
  }
  migrateRegistrationDates();
}

function migrateRegistrationDates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SOURCE_SHEET_NAME);
  if (!sheet) return ss.toast("Sheet " + SOURCE_SHEET_NAME + " not found!");

  ss.toast("Warming up cache for dates migration...", "CRM Sync");
  warmUpCourseCache(); 
  
  var allStudents = _fetchAll('students', 'select=id,email');
  var studentCache = {};
  if (allStudents) {
    for (var i = 0; i < allStudents.length; i++) {
      if (allStudents[i].email) studentCache[allStudents[i].email] = allStudents[i].id;
    }
  }

  var scriptProps = PropertiesService.getScriptProperties();
  var savedRow = scriptProps.getProperty('MIGRATE_DATES_START_ROW');
  var startRow = savedRow ? parseInt(savedRow, 10) : 2;
  var lastRow = sheet.getLastRow();

  if (startRow === 2) {
    ss.toast("Starting Date Migration from row " + startRow, "CRM Sync");
  } else {
    ss.toast("Resuming Date Migration from row " + startRow, "CRM Sync");
  }

  var MIGRATION_BATCH = 200; 
  var CURRENT_MIG_START_TIME = Date.now();

  for (var r = startRow; r <= lastRow; r += MIGRATION_BATCH) {
    if (Date.now() - CURRENT_MIG_START_TIME > MAX_EXECUTION_TIME) {
      scriptProps.setProperty('MIGRATE_DATES_START_ROW', r.toString());
      ScriptApp.newTrigger('resumeMigrateRegistrationDates')
        .timeBased()
        .after(60 * 1000)
        .create();
      ss.toast("Time limit reached. Will resume from line " + r + " automatically...", "Migration paused");
      return;
    }

    var endRow = Math.min(r + MIGRATION_BATCH - 1, lastRow);
    var numRows = endRow - r + 1;
    var numCols = sheet.getLastColumn();
    var rangeValues = sheet.getRange(r, 1, numRows, numCols).getValues();
    var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];

    var updates = [];

    for (var i = 0; i < rangeValues.length; i++) {
       var rowData = rangeValues[i];
       if (!rowData[0]) continue;
       var formCreatedAt = formatIsoDateTime(rowData[0]);

       var email = String(rowData[4] || "").trim().toLowerCase();
       if (!email) continue;
       
       var sId = studentCache[email];
       if (!sId) continue;

       for (var col = FIXED_COL_COUNT; col < headers.length; col++) {
           var courseName = headers[col];
           var cellValue = rowData[col];
           
           if (courseName && cellValue && String(cellValue).trim() !== "") {
               var cId = COURSE_CACHE[courseName];
               if (cId) {
                   var variants = String(cellValue).split(',').map(function(s) { return s.trim(); });
                   for (var v = 0; v < variants.length; v++) {
                       updates.push({
                           student_id: sId,
                           course_id: cId,
                           course_variant: variants[v],
                           created_at: formCreatedAt
                       });
                   }
               }
           }
       }
    }

    if (updates.length > 0) {
       var resp = _fetch('rpc/bulk_update_registration_dates', 'post', { updates: updates });
       if (resp === null) {
           ss.toast("Error hitting rpc for lines " + r + " to " + endRow, "CRM Sync Error");
       } else {
           Logger.log("Successfully migrated dates for row block " + r + "-" + endRow);
       }
    }
  }

  scriptProps.deleteProperty('MIGRATE_DATES_START_ROW');
  ss.toast("Date Migration Complete! Run Mirror Sync to view changes.", "CRM Sync");
}

// ==========================================
// SETUP & TRIGGERS
// ==========================================

function setupMirrorSheetFormatting() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MIRROR_SHEET_NAME);
  if (!sheet) return ss.toast("Сначала запустите загрузку из Supabase хотя бы один раз.", "Ошибка");

  applyMirrorFormatting_(sheet, 20, sheet.getLastRow() - 1);
  ss.toast("Форматирование успешно применено!", "Setup");
}

function setupTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  
  // Скачиваем данные ИЗ Supabase В CRM Mirror каждый час
  ScriptApp.newTrigger('syncFromSupabase').timeBased().everyHours(1).create();
  
  // Отправляем данные ИЗ Формы В Supabase при каждом новом ответе
  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onFormSubmit().create();
      
  SpreadsheetApp.getActiveSpreadsheet().toast("Все фоновые триггеры успешно установлены.", "CRM Setup");
}

// ==========================================
// RECOVERY (ONE-TIME)
// ==========================================

function restoreDataFromBackup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('CRM Backup');
  if (!sheet) {
    ss.toast("Please create a 'CRM Backup' sheet with your old data!", "Error");
    return;
  }
  
  ss.toast("Loading data from Supabase...", "Recovery");
  warmUpCourseCache();
  
  var currentStudents = _fetchAll('students', 'select=id,first_name,last_name,email,phone,address,eircode,dob');
  var studentDict = {};
  for (var i = 0; i < currentStudents.length; i++) {
    var s = currentStudents[i];
    var key = (s.first_name || "").trim().toLowerCase() + "|" + 
              (s.last_name || "").trim().toLowerCase() + "|" + 
              (s.email || "").trim().toLowerCase();
    studentDict[key] = s;
  }
  
  var currentEnrollments = _fetchAll('enrollments', 'select=id,student_id,course_id,course_variant,status,notes,is_priority,invited_date,confirmed_date');
  var enrollmentDict = {};
  for (var e = 0; e < currentEnrollments.length; e++) {
    var enr = currentEnrollments[e];
    var varStr = enr.course_variant ? enr.course_variant.trim() : "";
    var ekey = enr.student_id + "_" + enr.course_id + "_" + varStr;
    enrollmentDict[ekey] = enr;
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return ss.toast("No data in CRM Backup", "Error");
  
  var headers = data[0];
  var restoredEnrCount = 0;
  var restoredStuCount = 0;
  
  var statusIdx = headers.indexOf('Status');
  var prioIdx = headers.indexOf('Priority');
  var fNameIdx = headers.indexOf('First Name');
  var lNameIdx = headers.indexOf('Last Name');
  var emailIdx = headers.indexOf('Email');
  var mobileIdx = headers.indexOf('Mobile');
  var addressIdx = headers.indexOf('Address');
  var eircodeIdx = headers.indexOf('Eircode');
  var dobIdx = headers.indexOf('DOB');
  var courseIdx = headers.indexOf('Course');
  var variantIdx = headers.indexOf('Variant / Language');
  var invDateIdx = headers.indexOf('Invited Date');
  var confDateIdx = headers.indexOf('Confirmed Date');
  var notesIdx = headers.indexOf('Notes');

  // Validate required columns exist
  if (fNameIdx === -1 || lNameIdx === -1 || emailIdx === -1) {
    ss.toast("CRM Backup is missing required columns (First Name, Last Name, Email).", "Error");
    return;
  }

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var fName = String(row[fNameIdx] || "").trim();
    var lName = String(row[lNameIdx] || "").trim();
    var emailStr = String(row[emailIdx] || "").trim();
    
    if (!emailStr) continue;
    
    var skey = fName.toLowerCase() + "|" + lName.toLowerCase() + "|" + emailStr.toLowerCase();
    var currentS = studentDict[skey];
    if (!currentS) continue;
    
    // 1. Restore Student metadata if empty in current db but present in backup
    var sPayload = {};
    if (!currentS.phone && mobileIdx !== -1 && row[mobileIdx]) sPayload.phone = normalizePhone(row[mobileIdx]);
    if (!currentS.address && addressIdx !== -1 && row[addressIdx]) sPayload.address = row[addressIdx];
    if (!currentS.eircode && eircodeIdx !== -1 && row[eircodeIdx]) sPayload.eircode = row[eircodeIdx];
    if (!currentS.dob && dobIdx !== -1 && row[dobIdx]) sPayload.dob = formatDate(row[dobIdx]);
    
    if (Object.keys(sPayload).length > 0) {
      var sRes = _fetch('students?id=eq.' + currentS.id, 'patch', sPayload, { 'Prefer': 'return=representation' });
      if (sRes) {
          if (sPayload.phone) currentS.phone = sPayload.phone;
          if (sPayload.address) currentS.address = sPayload.address;
          if (sPayload.eircode) currentS.eircode = sPayload.eircode;
          if (sPayload.dob) currentS.dob = sPayload.dob;
          restoredStuCount++;
      }
    }

    // 2. Restore Enrollment metadata
    var courseStr = courseIdx !== -1 ? String(row[courseIdx] || "").trim() : "";
    var variantStr = variantIdx !== -1 ? String(row[variantIdx] || "").trim() : "";
    
    if (!courseStr || courseStr === "None" || courseStr === "Unknown Course") continue;
    
    var cId = getCourseId(courseStr);
    if (!cId) continue;
    
    var ekey = currentS.id + "_" + cId + "_" + variantStr;
    var currentE = enrollmentDict[ekey];
    
    if (currentE) {
       var statusBk = statusIdx !== -1 ? String(row[statusIdx] || "").toLowerCase() : "";
       var isPrioBk = prioIdx !== -1 ? (String(row[prioIdx]).indexOf('High') !== -1) : false;
       var notesBk = notesIdx !== -1 ? row[notesIdx] : "";
       var invDateBk = invDateIdx !== -1 ? formatDate(row[invDateIdx]) : null;
       var confDateBk = confDateIdx !== -1 ? formatDate(row[confDateIdx]) : null;
       
       var ePayload = {};
       
       // Compare backup data with current data. If backup is "better", use it.
       if (statusBk && statusBk !== 'requested' && statusBk !== 'no enrollments' && currentE.status === 'requested') {
         ePayload.status = statusBk;
       }
       if (isPrioBk && !currentE.is_priority) ePayload.is_priority = true;
       if (notesBk && !currentE.notes) ePayload.notes = notesBk;
       if (invDateBk && !currentE.invited_date) ePayload.invited_date = invDateBk;
       if (confDateBk && !currentE.confirmed_date) ePayload.confirmed_date = confDateBk;
       
       if (Object.keys(ePayload).length > 0) {
         var eRes = _fetch('enrollments?id=eq.' + currentE.id, 'patch', ePayload, { 'Prefer': 'return=representation' });
         if (eRes) {
             if (ePayload.status) currentE.status = ePayload.status;
             if (ePayload.is_priority) currentE.is_priority = true;
             if (ePayload.notes) currentE.notes = ePayload.notes;
             if (ePayload.invited_date) currentE.invited_date = ePayload.invited_date;
             if (ePayload.confirmed_date) currentE.confirmed_date = ePayload.confirmed_date;
             restoredEnrCount++;
         }
       }
    }
  }
  
  ss.toast("Restored data for " + restoredEnrCount + " enrolls & " + restoredStuCount + " students!", "Success");
}