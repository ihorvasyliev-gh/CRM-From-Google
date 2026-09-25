// ==========================================
// CONFIGURATION
// To set your credentials, go to:
// Project Settings → Script Properties → Add:
//   SUPABASE_URL = https://your-project.supabase.co
//   SUPABASE_KEY = your-service-role-key
// ==========================================

var CONFIG_ = null; // read once per execution, not on every request

function getConfig_() {
  if (CONFIG_) return CONFIG_;
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL') || '';
  var key = props.getProperty('SUPABASE_KEY') || '';
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY must be set in Script Properties.');
  }
  CONFIG_ = { url: url, key: key };
  return CONFIG_;
}

var BATCH_SIZE = 50;
var SOURCE_SHEET_NAME = 'Form responses 1'; // Google Form answers → Supabase
var MIRROR_SHEET_NAME = 'CRM Mirror';       // Supabase → read-only sheet

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
    .createMenu('🔄 CRM Sync (v2.5)')
    .addItem('⬇️ Refresh CRM Mirror now', 'syncFromSupabase')
    .addSeparator()
    .addItem('📞 Sync Missing Phone Numbers', 'syncMissingPhoneNumbers')
    .addItem('⬆️ Upload the last 20 to Supabase', 'syncAllRecent')
    .addItem('⬆️ Export ALL answers to Supabase', 'startFullSync')
    .addSeparator()
    .addItem('🛠 Settings: Triggers (Automation)', 'setupTriggers')
    .addToUi();
}

// ==========================================
// FORM → SUPABASE (Upload)
// ==========================================

/**
 * Helper to identify phone/mobile header names in English, Russian, Ukrainian, etc.
 */
function isPhoneHeader_(h) {
  if (!h) return false;
  var s = String(h).trim().toLowerCase();
  if (s.indexOf('pps') !== -1 || s.indexOf('ppsn') !== -1 || s.indexOf('eircode') !== -1 || s.indexOf('score') !== -1) {
    return false;
  }
  return (
    s.indexOf('phone') !== -1 ||
    s.indexOf('mobile') !== -1 ||
    s.indexOf('телефон') !== -1 ||
    s.indexOf('номер') !== -1 ||
    s.indexOf('тел') !== -1 ||
    s.indexOf('tel') !== -1 ||
    s.indexOf('cell') !== -1 ||
    s.indexOf('contact') !== -1 ||
    s.indexOf('whatsapp') !== -1 ||
    s.indexOf('number') !== -1
  );
}

/**
 * Helper to compare first/last names flexibly (ignoring punctuation, case, order).
 */
function areNamesSimilar_(firstName1, lastName1, firstName2, lastName2) {
  var f1 = String(firstName1 || "").trim().toLowerCase().replace(/[^a-z0-9\u0400-\u04FF]/g, '');
  var l1 = String(lastName1 || "").trim().toLowerCase().replace(/[^a-z0-9\u0400-\u04FF]/g, '');
  var f2 = String(firstName2 || "").trim().toLowerCase().replace(/[^a-z0-9\u0400-\u04FF]/g, '');
  var l2 = String(lastName2 || "").trim().toLowerCase().replace(/[^a-z0-9\u0400-\u04FF]/g, '');
  
  if (!f1 || !l1 || !f2 || !l2) return false;
  if (f1 === f2 && l1 === l2) return true;
  if (f1 === l2 && l1 === f2) return true;
  
  var full1 = f1 + l1;
  var full2 = f2 + l2;
  var full2Swap = l2 + f2;
  if (full1 === full2 || full1 === full2Swap) return true;
  
  return false;
}

// Student fields in the registration form, checked in this order (lower-cased header).
var FIELD_MATCHERS_ = [
  ['email',     function (h) { return /mail|почта/.test(h) || h === 'username'; }],
  ['timestamp', function (h) { return /timestamp|отметка|дата подачи|submission/.test(h); }],
  ['firstName', function (h) { return /first name|first_name/.test(h) || h === 'имя' || h === 'firstname' || h === 'first-name'; }],
  ['lastName',  function (h) { return /last name|last_name|surname/.test(h) || h === 'фамилия' || h === 'lastname' || h === 'last-name'; }],
  ['phone',     isPhoneHeader_],
  ['dob',       function (h) { return /dob|birth|рождения/.test(h); }],
  ['eircode',   function (h) { return /eircode|postcode|zip|индекс|postal/.test(h); }],
  ['address',   function (h) { return /address|адрес|street/.test(h); }]
];
// Other questions that are not courses.
var OTHER_NON_COURSE_RE_ = /@|score|балл|full ?name|consent|gdpr|agreement|согласие|gender|пол|age|возраст|pps|comment|notes|комментар|feedback|nationality|гражданство/;

function matchField_(h) {
  for (var i = 0; i < FIELD_MATCHERS_.length; i++) {
    if (FIELD_MATCHERS_[i][1](h)) return FIELD_MATCHERS_[i][0];
  }
  return null;
}

/**
 * True when a header is a student field or other metadata rather than a course.
 */
function isNonCourseHeader_(header) {
  var h = String(header || '').trim().toLowerCase();
  return !h || h === 'фио' || !!matchField_(h) || OTHER_NON_COURSE_RE_.test(h);
}

/**
 * Finds the column index of each student field, plus the course columns.
 */
function getSourceHeaderMap_(headers) {
  var map = {
    timestamp: -1, firstName: -1, lastName: -1, phone: -1, email: -1,
    address: -1, eircode: -1, dob: -1, emailIndices: [], courseIndices: []
  };
  var known = {};

  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || '').trim().toLowerCase();
    if (!h) continue;
    var field = matchField_(h);
    if (field) {
      if (map[field] === -1) map[field] = c;
      if (field === 'email') map.emailIndices.push(c);
      known[c] = true;
    } else if (isNonCourseHeader_(h)) {
      known[c] = true;
    }
  }

  // Default Google Form layout as a fallback, only for columns nothing else claimed.
  ['timestamp', 'firstName', 'lastName', 'phone', 'email', 'address', 'eircode', 'dob'].forEach(function (field, i) {
    if (map[field] === -1 && i < headers.length && !known[i]) {
      map[field] = i;
      if (field === 'email') map.emailIndices.push(i);
    }
    if (map[field] !== -1) known[map[field]] = true;
  });

  for (var i = 0; i < headers.length; i++) {
    if (!known[i] && !isNonCourseHeader_(headers[i])) map.courseIndices.push(i);
  }
  return map;
}

/**
 * First non-empty email in the row (lower-cased), or ''.
 */
function getRowEmail_(row, headerMap) {
  for (var i = 0; i < headerMap.emailIndices.length; i++) {
    var v = String(row[headerMap.emailIndices[i]] || '').trim();
    if (v) return v.toLowerCase();
  }
  return '';
}

/**
 * Triggered on Form Submit. Syncs just the new row.
 */
function onFormSubmit(e) {
  try {
    if (!e || !e.range) {
      log_('onFormSubmit: Event object or range is missing', 'WARN');
      return;
    }
    var sheet = e.range.getSheet();
    if (sheet.getName() !== SOURCE_SHEET_NAME) {
      Logger.log('onFormSubmit: sheet "' + sheet.getName() + '" is not "' + SOURCE_SHEET_NAME + '", skipping.');
      return;
    }

    warmUpCourseCache();
    var row = e.range.getRow();
    syncRowsRange(sheet, row, row);
    log_('onFormSubmit: row ' + row + ' synced', 'INFO');
  } catch (err) {
    log_('onFormSubmit error: ' + err + (err.stack ? '\nStack: ' + err.stack : ''), 'ERROR');
  }
}

/**
 * Triggers periodically or manually. Syncs recent entries.
 */
function syncAllRecent() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SOURCE_SHEET_NAME);
  if (!sheet) {
    ss.toast('Sheet "' + SOURCE_SHEET_NAME + '" not found.', 'Error');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  warmUpCourseCache();
  var startRow = Math.max(2, lastRow - 20); 
  syncRowsRange(sheet, startRow, lastRow);
  ss.toast('The last rows have been uploaded to Supabase!', 'CRM Sync');
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
    ss.toast('Sheet "' + SOURCE_SHEET_NAME + '" not found.', 'Error');
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
      failedBatches = 0;
      Utilities.sleep(500); 
    } catch (err) {
      failedBatches++;
      Logger.log("Error syncing batch " + r + "-" + endRow + ": " + err);
      ss.toast('Error on line ' + r + ': ' + String(err).substring(0, 80), 'CRM Sync Error');
      
      if (failedBatches >= MAX_CONSECUTIVE_FAILURES) {
        scriptProps.setProperty('SYNC_START_ROW', r.toString());
        ScriptApp.newTrigger('resumeSyncAllRowsBatched')
          .timeBased()
          .after(2 * 60 * 1000)
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
 * Core Logic: Syncs a range of rows using Batch Upserts with dynamic headers.
 */
function syncRowsRange(sheet, startRow, endRow) {
  if (startRow > endRow) return;
  
  var numRows = endRow - startRow + 1;
  var numCols = sheet.getLastColumn();
  if (numCols < 3) return;

  var rangeValues = sheet.getRange(startRow, 1, numRows, numCols).getValues();
  var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0].map(String);
  var headerMap = getSourceHeaderMap_(headers);

  var studentsToUpsert = [];
  var rowMap = [];

  for (var i = 0; i < rangeValues.length; i++) {
    var rowData = rangeValues[i];
    var eMail = getRowEmail_(rowData, headerMap);
    if (!eMail) continue;

    var fName = headerMap.firstName !== -1 ? String(rowData[headerMap.firstName] || "").trim() : "";
    var lName = headerMap.lastName !== -1 ? String(rowData[headerMap.lastName] || "").trim() : "";
    var rawPhone = headerMap.phone !== -1 ? rowData[headerMap.phone] : "";
    var rawAddress = headerMap.address !== -1 ? rowData[headerMap.address] : "";
    var rawEircode = headerMap.eircode !== -1 ? rowData[headerMap.eircode] : "";
    var rawDob = headerMap.dob !== -1 ? rowData[headerMap.dob] : "";
    var rawTimestamp = headerMap.timestamp !== -1 ? rowData[headerMap.timestamp] : "";

    studentsToUpsert.push({
      first_name: fName,
      last_name: lName,
      phone: normalizePhone(rawPhone),
      email: eMail, 
      address: rawAddress || "",
      eircode: rawEircode || "",
      dob: formatDate(rawDob),
      last_synced_at: new Date().toISOString(),
      created_at: formatIsoDateTime(rawTimestamp)
    });
    
    rowMap.push({ 
      key: fName.toLowerCase() + "|" + lName.toLowerCase() + "|" + eMail, 
      rowData: rowData,
      rawTimestamp: rawTimestamp
    });
  }

  if (studentsToUpsert.length === 0) return;

  resubscribeReRegisteredEmails_(rowMap);

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

  // Get list of emails in this batch to fetch existing records
  var batchEmails = uniqueStudents.map(function(s) { return s.email; });
  var existingStudents = [];
  if (batchEmails.length > 0) {
    var queryParams = 'select=id,first_name,last_name,email,phone,address,eircode,dob&email=in.' + pgrstInList_(batchEmails);
    existingStudents = _fetch('students?' + queryParams, 'get') || [];
  }

  var existingByEmail = {};
  for (var j = 0; j < existingStudents.length; j++) {
    var ext = existingStudents[j];
    var emailKey = String(ext.email || "").trim().toLowerCase();
    if (!existingByEmail[emailKey]) existingByEmail[emailKey] = [];
    existingByEmail[emailKey].push(ext);
  }

  var keyToIdMap = {};
  var studentsToInsert = [];

  for (var k = 0; k < uniqueStudents.length; k++) {
    var s = uniqueStudents[k];
    var matches = existingByEmail[s.email] || [];
    var matchedStudent = null;
    
    for (var m = 0; m < matches.length; m++) {
      var ext = matches[m];
      if (areNamesSimilar_(s.first_name, s.last_name, ext.first_name, ext.last_name)) {
        matchedStudent = ext;
        break;
      }
    }
    
    var compositeKey = s.first_name.toLowerCase() + "|" + s.last_name.toLowerCase() + "|" + s.email;
    
    if (matchedStudent) {
      var patchPayload = {};
      if (!matchedStudent.first_name && s.first_name) patchPayload.first_name = s.first_name;
      if (!matchedStudent.last_name && s.last_name) patchPayload.last_name = s.last_name;
      if ((!matchedStudent.phone || String(matchedStudent.phone).trim() === '' || matchedStudent.phone === '+0000000') && s.phone) patchPayload.phone = s.phone;
      if (!matchedStudent.address && s.address) patchPayload.address = s.address;
      if (!matchedStudent.eircode && s.eircode) patchPayload.eircode = s.eircode;
      if (!matchedStudent.dob && s.dob) patchPayload.dob = s.dob;
      
      if (Object.keys(patchPayload).length > 0) {
        patchPayload.last_synced_at = new Date().toISOString();
        _fetch('students?id=eq.' + matchedStudent.id, 'patch', patchPayload);
        for (var f in patchPayload) matchedStudent[f] = patchPayload[f];
      }
      
      keyToIdMap[compositeKey] = matchedStudent.id;
    } else {
      studentsToInsert.push(s);
    }
  }

  if (studentsToInsert.length > 0) {
    var upsertedStudents = _fetch('students?on_conflict=first_name,last_name,email', 'post', studentsToInsert, { 
      'Prefer': 'return=representation' 
    });
    if (!upsertedStudents) throw new Error("Failed to insert new students.");
    
    for (var k = 0; k < upsertedStudents.length; k++) {
      var s = upsertedStudents[k];
      var compositeKey = String(s.first_name || "").toLowerCase() + "|" + String(s.last_name || "").toLowerCase() + "|" + String(s.email || "").toLowerCase();
      keyToIdMap[compositeKey] = s.id;
    }
  }

  // Build Enrollments. A student who already has an active (not withdrawn/rejected)
  // enrollment in a course doesn't get a second one from a repeat form submission.
  var batchStudentIds = {};
  for (var k in keyToIdMap) {
    if (keyToIdMap[k]) batchStudentIds[keyToIdMap[k]] = true;
  }
  batchStudentIds = Object.keys(batchStudentIds);

  var activeEnrollment = {}; // "studentId_courseId" → true
  if (batchStudentIds.length > 0) {
    var enrData = _fetch('enrollments?select=student_id,course_id,status&student_id=in.' + pgrstInList_(batchStudentIds), 'get') || [];
    for (var eIdx = 0; eIdx < enrData.length; eIdx++) {
      var enr = enrData[eIdx];
      if (enr.status !== 'withdrawn' && enr.status !== 'rejected') {
        activeEnrollment[enr.student_id + "_" + enr.course_id] = true;
      }
    }
  }

  var enrollmentsToUpsert = [];
  var enrollmentKeys = {};

  for (var m = 0; m < rowMap.length; m++) {
    var mapItem = rowMap[m];
    var sId = keyToIdMap[mapItem.key];
    if (!sId) continue;

    var rowTimestampIso = formatIsoDateTime(mapItem.rawTimestamp);

    for (var cIdx = 0; cIdx < headerMap.courseIndices.length; cIdx++) {
      var col = headerMap.courseIndices[cIdx];
      var courseName = headers[col];
      var strVal = String(mapItem.rowData[col] || '').trim();
      if (!strVal || strVal.indexOf('@') !== -1) continue; // empty, or an email typed into a course column

      var cId = getCourseId(courseName);
      if (!cId) continue;
      if (activeEnrollment[sId + "_" + cId]) {
        Logger.log('Student ' + sId + ' already has an active enrollment in course ' + cId + ', skipping.');
        continue;
      }

      var variants = strVal.split(',');
      for (var v = 0; v < variants.length; v++) {
        var varText = variants[v].trim();
        if (!varText) continue;
        var cleanedVariant = cleanVariant_(courseName, varText);
        var uniqueKey = sId + "_" + cId + "_" + cleanedVariant;
        if (!enrollmentKeys[uniqueKey]) {
          enrollmentsToUpsert.push({
            student_id: sId,
            course_id: cId,
            course_variant: cleanedVariant,
            status: 'requested',
            created_at: rowTimestampIso
          });
          enrollmentKeys[uniqueKey] = true;
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

/**
 * Unsubscribe list (migration 62): an email that registers again through
 * the Google Form gets emails turned back on. Only a form submission made
 * AFTER the opt-out counts, so re-syncing old rows never undoes an unsubscribe.
 */
function resubscribeReRegisteredEmails_(rowMap) {
  var latestByEmail = {};
  for (var i = 0; i < rowMap.length; i++) {
    var raw = rowMap[i].rawTimestamp;
    if (!raw || String(raw).trim() === "") continue; // no timestamp → can't tell if it's a new registration
    var email = rowMap[i].key.split("|").pop();
    var ts = formatIsoDateTime(raw);
    if (!latestByEmail[email] || ts > latestByEmail[email]) latestByEmail[email] = ts;
  }

  var emails = Object.keys(latestByEmail);
  if (emails.length === 0) return;

  var optOuts = _fetch('email_opt_outs?select=email,opted_out_at&email=in.' + pgrstInList_(emails), 'get');
  if (!optOuts || !optOuts.length) return; // nobody unsubscribed (or migration 62 not applied yet)

  for (var j = 0; j < optOuts.length; j++) {
    var optOut = optOuts[j];
    var submittedAt = latestByEmail[optOut.email];
    if (!submittedAt || new Date(submittedAt).getTime() <= new Date(optOut.opted_out_at).getTime()) continue;
    _fetch('email_opt_outs?email=eq.' + encodeURIComponent(optOut.email) + '&opted_out_at=lt.' + encodeURIComponent(submittedAt), 'delete');
    log_('Re-registered via Google Form, emails turned back on for ' + optOut.email, 'INFO');
  }
}

// ==========================================
// API HELPERS (with retry & resilience)
// ==========================================

/**
 * Builds a URL-encoded PostgREST in.(...) list. Every value is double-quoted,
 * so a comma, parenthesis or quote typed into a form field can't break the filter.
 */
function pgrstInList_(values) {
  return '(' + values.map(function(v) {
    return encodeURIComponent('"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
  }).join(',') + ')';
}

/**
 * Fetches every row of a table, 1000 at a time. Ordered by id so pages never
 * overlap or skip rows. Returns null if any page fails, never a partial list.
 */
function _fetchAll(endpoint, selectQuery) {
  var allData = [];
  var limit = 1000;
  for (var offset = 0; ; offset += limit) {
    var res = _fetch(endpoint + '?' + selectQuery + '&order=id', 'get', null, {
      'Range-Unit': 'items',
      'Range': offset + '-' + (offset + limit - 1)
    });
    if (!Array.isArray(res)) return null;
    allData = allData.concat(res);
    if (res.length < limit) return allData;
  }
}

/**
 * Aggressively normalizes a course name to prevent duplicates.
 */
function normalizeCourseName_(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * Normalizes course variant to match CRM frontend cleanVariant logic.
 * E.g. "SNA (English)" -> "English", "" / null -> "English", "ECDL Ukrainian" -> "Ukrainian"
 */
function cleanVariant_(courseName, variant) {
  if (!variant || !String(variant).trim()) return 'English';
  var v = String(variant).trim();
  // Extract text inside parentheses
  var match = v.match(/\((.*?)\)/);
  if (match && match[1].trim()) {
    v = match[1].trim();
  } else {
    // Remove course name from beginning
    var lowerV = v.toLowerCase();
    var lowerName = (courseName || '').toLowerCase();
    if (lowerName && lowerV.indexOf(lowerName) === 0) {
      var stripped = v.substring(courseName.length).trim();
      stripped = stripped.replace(/^[-()_:]+|[-()_:]+$/g, '').trim();
      if (stripped) {
        v = stripped;
      }
    }
  }
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

function warmUpCourseCache() {
  var allCourses = _fetchAll('courses', 'select=id,name');
  if (allCourses) {
    for (var i = 0; i < allCourses.length; i++) {
      COURSE_CACHE[normalizeCourseName_(allCourses[i].name)] = allCourses[i].id;
    }
  }
}

/**
 * Gets a course ID by name, creating the course if it doesn't exist yet.
 */
function getCourseId(name) {
  var normalized = normalizeCourseName_(name);
  // Re-check after whitespace cleanup so an odd "First Name" header never becomes a course.
  if (isNonCourseHeader_(normalized)) return null;
  if (COURSE_CACHE[normalized]) return COURSE_CACHE[normalized];
  
  var res = _fetch('courses?name=eq.' + encodeURIComponent(normalized), 'get');
  if (res && res.length > 0) {
    COURSE_CACHE[normalized] = res[0].id;
    return res[0].id;
  }
  
  if (res === null) {
    Logger.log('ERROR: API failed looking up course "' + normalized + '". Refusing to create to prevent duplicates.');
    return null;
  }
  
  var fuzzyRes = _fetch('courses?name=ilike.' + encodeURIComponent(normalized), 'get');
  if (fuzzyRes && fuzzyRes.length > 0) {
    COURSE_CACHE[normalized] = fuzzyRes[0].id;
    Logger.log('Fuzzy-matched course "' + normalized + '" → existing "' + fuzzyRes[0].name + '" (id: ' + fuzzyRes[0].id + ')');
    return fuzzyRes[0].id;
  }
  
  if (fuzzyRes === null) {
    Logger.log('ERROR: API failed on ilike lookup for course "' + normalized + '". Refusing to create to prevent duplicates.');
    return null;
  }
  
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
        if (!content || String(content).trim() === '') return { success: true };
        try {
          return JSON.parse(content);
        } catch (parseErr) {
          return { success: true, raw: content };
        }
      }
      
      if (code >= 400 && code < 500) {
        Logger.log("Supabase Client Error [" + method.toUpperCase() + " " + endpoint + "] (" + code + "): " + content);
        return null;
      }
      
      lastError = "HTTP " + code + ": " + content;
      Logger.log("Supabase Server Error (attempt " + (attempt + 1) + "/" + MAX_RETRIES + ") [" + method.toUpperCase() + " " + endpoint + "] (" + code + "): " + content.substring(0, 200));
      
    } catch (networkErr) {
      lastError = String(networkErr);
      Logger.log("Network Error (attempt " + (attempt + 1) + "/" + MAX_RETRIES + ") [" + method.toUpperCase() + " " + endpoint + "]: " + lastError.substring(0, 200));
    }
    
    if (attempt < MAX_RETRIES - 1) {
      Utilities.sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }
  
  Logger.log("All " + MAX_RETRIES + " retries exhausted for [" + method.toUpperCase() + " " + endpoint + "]. Last error: " + lastError);
  return null;
}

// ==========================================
// DATA FORMATTERS (Robust Date & Phone Parsers)
// ==========================================

/**
 * Formats Date of Birth (DOB) safely as 'yyyy-MM-dd' for Supabase.
 * Corrects 2-digit birth years (e.g. 75 -> 1975, 94 -> 1994, 36 -> 1936, 02 -> 2002).
 */
function formatDate(dateObj) {
  if (!dateObj || String(dateObj).trim() === "") return null;
  
  if (dateObj instanceof Date) {
    if (isNaN(dateObj.getTime())) return null;
    return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  var str = String(dateObj).trim();
  
  // Check ISO format YYYY-MM-DD
  var isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[1] + "-" + isoMatch[2] + "-" + isoMatch[3];

  // Check DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  var dmyMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/);
  if (dmyMatch) {
    var day = parseInt(dmyMatch[1], 10);
    var month = parseInt(dmyMatch[2], 10);
    var year = parseInt(dmyMatch[3], 10);

    // If 2-digit birth year: 00..25 -> 2000..2025; 26..99 -> 1926..1999
    if (year < 100) {
      year = (year > 25) ? 1900 + year : 2000 + year;
    }

    var mStr = month < 10 ? "0" + month : "" + month;
    var dStr = day < 10 ? "0" + day : "" + day;
    return year + "-" + mStr + "-" + dStr;
  }

  try {
    var d = new Date(str);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
  } catch (e) {}

  return null;
}

/**
 * Converts Google Sheets Timestamp to ISO String for Supabase.
 * Handles Date instances and European/Irish DD/MM/YYYY HH:mm:ss strings accurately.
 */
function formatIsoDateTime(dateObj) {
  if (!dateObj || String(dateObj).trim() === "") return new Date().toISOString();
  
  if (dateObj instanceof Date) {
    if (!isNaN(dateObj.getTime())) return dateObj.toISOString();
    return new Date().toISOString();
  }

  var str = String(dateObj).trim();

  // Check if string is DD/MM/YYYY HH:mm:ss
  var dmyMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    var day = parseInt(dmyMatch[1], 10);
    var month = parseInt(dmyMatch[2], 10) - 1; // 0-based
    var year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;

    var hours = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    var minutes = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    var seconds = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;

    var parsedDate = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(parsedDate.getTime())) return parsedDate.toISOString();
  }

  try {
    var d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch (e) {}
  
  return new Date().toISOString();
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

// One row per enrollment; students with no enrollments get one row too.
// This list is the single source of truth for column order, header, width and format.
// r = { s: student, e: enrollment ({} when none), flags: [...], tz: spreadsheet time zone }
var MIRROR_COLUMNS = [
  { title: 'Course',      width: 200, value: function (r) { return r.e.course ? r.e.course.name : ''; } },
  { title: 'Variant',     width: 90,  center: true, value: function (r) { return r.e.course_variant || ''; } },
  { title: 'Status',      width: 110, center: true, value: function (r) { return statusLabel_(r.e.status); } },
  { title: 'Priority',    width: 70,  center: true, value: function (r) { return r.e.is_priority ? '⭐' : ''; } },
  { title: 'First Name',  width: 120, bold: true,   value: function (r) { return r.s.first_name || ''; } },
  { title: 'Last Name',   width: 130, bold: true,   value: function (r) { return r.s.last_name || ''; } },
  { title: 'Email',       width: 220, value: function (r) { return r.s.email || ''; } },
  { title: 'Mobile',      width: 130, value: function (r) { return r.s.phone || ''; } },
  { title: 'Flags',       width: 200, value: function (r) { return buildFlagsSummary_(r.flags); } },
  { title: 'Notes',       width: 220, value: function (r) { return r.e.notes || ''; } },
  { title: 'Course Date', width: 105, date: true, value: function (r) { return toSheetDate_(r.e.invited_date, r.tz); } },
  { title: 'Confirmed',   width: 105, date: true, value: function (r) { return toSheetDate_(r.e.confirmed_date, r.tz); } },
  { title: 'Completed',   width: 105, date: true, value: function (r) { return toSheetDate_(r.e.completed_date, r.tz); } },
  { title: 'Registered',  width: 105, date: true, value: function (r) { return toSheetDate_(r.e.created_at || r.s.created_at, r.tz); } },
  { title: 'DOB',         width: 100, date: true, value: function (r) { return toSheetDate_(r.s.dob, r.tz); } },
  { title: 'Address',     width: 220, value: function (r) { return r.s.address || ''; } },
  { title: 'Eircode',     width: 90,  center: true, value: function (r) { return r.s.eircode || ''; } },
  { title: 'Enrollment ID', width: 60, hidden: true, value: function (r) { return r.e.id || ''; } },
  { title: 'Student ID',    width: 60, hidden: true, value: function (r) { return r.s.id || r.e.student_id || ''; } }
];

// Board order, used to sort rows inside a course. [background, text colour]
var STATUS_STYLES_ = {
  Requested: ['#eeeeee', '#424242'],
  Invited:   ['#fff9c4', '#f57f17'],
  Confirmed: ['#c8e6c9', '#1b5e20'],
  Completed: ['#bbdefb', '#0d47a1'],
  Withdrawn: ['#ffcdd2', '#b71c1c'],
  Rejected:  ['#f8bbd0', '#880e4f']
};
var STATUS_ORDER_ = Object.keys(STATUS_STYLES_);
var NO_ENROLLMENT_LABEL_ = 'No enrollments';

function statusLabel_(status) {
  if (!status) return NO_ENROLLMENT_LABEL_;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Supabase date ('2026-09-25') or timestamp → Sheets date serial number.
 * A real date (not text) sorts and filters correctly and never shifts a day between time zones.
 */
function toSheetDate_(val, tz) {
  if (!val) return '';
  var ymd = String(val);
  if (ymd.length !== 10) {
    var d = new Date(ymd);
    if (isNaN(d.getTime())) return '';
    ymd = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  }
  var p = ymd.split('-');
  return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000 + 25569; // 25569 = serial of 1970-01-01
}

function buildFlagsSummary_(flags) {
  if (!flags || !flags.length) return '';
  return '⚠ ' + flags.map(function (f) {
    return (f.course ? f.course.name : 'Unknown') + (f.comment ? ' — ' + f.comment : '');
  }).join('; ');
}

/**
 * Rebuilds the CRM Mirror sheet from Supabase. Runs hourly and from the menu.
 * If any download fails, the sheet is left as it was.
 */
function syncFromSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MIRROR_SHEET_NAME) || ss.insertSheet(MIRROR_SHEET_NAME);
  ss.toast('Downloading data from Supabase...', 'CRM Mirror');

  var students = _fetchAll('students', 'select=id,first_name,last_name,email,phone,address,eircode,dob,created_at');
  var enrollments = students && _fetchAll('enrollments',
    'select=id,student_id,status,course_variant,is_priority,notes,invited_date,confirmed_date,completed_date,created_at,course:courses(name)');
  var flags = enrollments && _fetchAll('student_flags', 'select=id,student_id,comment,course:courses(name)');
  if (!flags) {
    log_('CRM Mirror: download from Supabase failed, sheet left unchanged', 'ERROR');
    ss.toast('Could not download from Supabase. The sheet was left unchanged; details in SystemLogs.', 'CRM Mirror ❌');
    return;
  }

  var tz = ss.getSpreadsheetTimeZone();
  var studentById = {}, flagsByStudent = {}, enrolled = {};
  students.forEach(function (s) { studentById[s.id] = s; });
  flags.forEach(function (f) { (flagsByStudent[f.student_id] = flagsByStudent[f.student_id] || []).push(f); });

  // Course A→Z, then board order (Requested → … → Rejected), then newest first.
  enrollments.sort(function (a, b) {
    var an = a.course ? a.course.name : '', bn = b.course ? b.course.name : '';
    return an.localeCompare(bn) ||
      STATUS_ORDER_.indexOf(statusLabel_(a.status)) - STATUS_ORDER_.indexOf(statusLabel_(b.status)) ||
      String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });

  var records = enrollments.map(function (e) {
    enrolled[e.student_id] = true;
    return { s: studentById[e.student_id] || {}, e: e };
  });
  students.forEach(function (s) {
    if (!enrolled[s.id]) records.push({ s: s, e: {} });
  });
  var rows = records.map(function (r) {
    r.flags = flagsByStudent[r.s.id || r.e.student_id];
    r.tz = tz;
    return MIRROR_COLUMNS.map(function (col) { return col.value(r); });
  });

  writeMirror_(sheet, rows, tz);
  ss.toast('✅ ' + enrollments.length + ' enrollments, ' + students.length + ' students', 'CRM Mirror');
}

function writeMirror_(sheet, rows, tz) {
  var numCols = MIRROR_COLUMNS.length;
  var titles = MIRROR_COLUMNS.map(function (c) { return c.title; });

  // Keep whatever filter people had set, matched by column title.
  var savedCriteria = {};
  var oldFilter = sheet.getFilter();
  if (oldFilter) {
    var fr = oldFilter.getRange();
    sheet.getRange(1, fr.getColumn(), 1, fr.getNumColumns()).getValues()[0].forEach(function (title, i) {
      var cr = oldFilter.getColumnFilterCriteria(fr.getColumn() + i);
      if (cr && title) savedCriteria[title] = cr;
    });
    oldFilter.remove();
  }

  sheet.clear(); // content + formats; column widths, protection and notes stay
  sheet.clearConditionalFormatRules();
  sheet.getBandings().forEach(function (b) { b.remove(); });
  sheet.showColumns(1, sheet.getMaxColumns());

  var needRows = Math.max(rows.length + 1, 2);
  if (sheet.getMaxRows() < needRows) sheet.insertRowsAfter(sheet.getMaxRows(), needRows - sheet.getMaxRows());
  var bodyRows = sheet.getMaxRows() - 1;

  // Formats go on before the values: text columns are plain text, so '+353…' keeps
  // its plus, '0871…' its zero, and a form answer starting with '=' is never run as a formula.
  MIRROR_COLUMNS.forEach(function (col, i) {
    var body = sheet.getRange(2, i + 1, bodyRows, 1);
    body.setNumberFormat(col.date ? 'dd/mm/yyyy' : '@');
    if (col.center) body.setHorizontalAlignment('center');
    if (col.bold) body.setFontWeight('bold');
    sheet.setColumnWidth(i + 1, col.width);
  });
  sheet.getRange(2, 1, bodyRows, numCols)
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

  sheet.getRange(1, 1, 1, numCols).setValues([titles])
    .setFontWeight('bold').setFontSize(10).setFontColor('#ffffff').setBackground('#1a237e')
    .setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  sheet.setRowHeight(1, 32);
  if (rows.length) sheet.getRange(2, 1, rows.length, numCols).setValues(rows);

  sheet.getRange(1, 1, rows.length + 1, numCols)
    .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor('#1a237e').setFirstRowColor('#ffffff').setSecondRowColor('#f5f7fa');
  sheet.setFrozenRows(1);
  MIRROR_COLUMNS.forEach(function (col, i) { if (col.hidden) sheet.hideColumns(i + 1); });

  var filter = sheet.getRange(1, 1, sheet.getMaxRows(), numCols).createFilter();
  titles.forEach(function (title, i) {
    if (savedCriteria[title]) filter.setColumnFilterCriteria(i + 1, savedCriteria[title]);
  });

  applyMirrorRules_(sheet, bodyRows);

  sheet.getRange(1, 1).setNote(
    'Last synced: ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm') + '\n\n' +
    'Read-only copy of the CRM, refreshed every hour. Make changes in the CRM app: ' +
    'anything typed here is overwritten on the next sync.\n\n' +
    'Tip: use Data → Filter views for your own filters that don\'t affect other people.');

  if (!sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
    sheet.protect().setWarningOnly(true)
      .setDescription('CRM Mirror is overwritten every hour. Edit in the CRM app instead.');
  }
}

function applyMirrorRules_(sheet, bodyRows) {
  var col = function (title) {
    for (var i = 0; i < MIRROR_COLUMNS.length; i++) if (MIRROR_COLUMNS[i].title === title) return i + 1;
  };
  var body = function (title) { return sheet.getRange(2, col(title), bodyRows, 1); };
  var statusLetter = sheet.getRange(1, col('Status')).getA1Notation().replace(/\d+/g, '');
  var rules = [];

  // Sheets applies the first matching rule per cell, so cell rules come before the row rule.
  Object.keys(STATUS_STYLES_).forEach(function (label) {
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(label)
      .setBackground(STATUS_STYLES_[label][0]).setFontColor(STATUS_STYLES_[label][1]).setBold(true)
      .setRanges([body('Status')]).build());
  });
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(NO_ENROLLMENT_LABEL_)
    .setFontColor('#9e9e9e').setItalic(true).setRanges([body('Status')]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenCellNotEmpty()
    .setBackground('#fff3e0').setFontColor('#e65100').setBold(true).setRanges([body('Flags')]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenCellNotEmpty()
    .setBackground('#fff8e1').setRanges([body('Priority')]).build());

  // Fade rows that are no longer active so the live pipeline stands out.
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=OR($' + statusLetter + '2="Withdrawn",$' + statusLetter + '2="Rejected",$' + statusLetter + '2="' + NO_ENROLLMENT_LABEL_ + '")')
    .setFontColor('#9e9e9e')
    .setRanges([sheet.getRange(2, 1, bodyRows, MIRROR_COLUMNS.length)]).build());

  sheet.setConditionalFormatRules(rules);
}


// ==========================================
// SETUP & TRIGGERS
// ==========================================

function setupTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  
  // Supabase → CRM Mirror every hour
  ScriptApp.newTrigger('syncFromSupabase').timeBased().everyHours(1).create();

  // Form → Supabase on every new answer
  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onFormSubmit().create();

  SpreadsheetApp.getActiveSpreadsheet().toast('Hourly mirror refresh and form-submit sync are on.', 'CRM Setup ✅');
}

/**
 * Logs a message to the execution log and the SystemLogs sheet (last ~1000 entries).
 */
function log_(message, level) {
  level = level || 'INFO';
  var timestamp = new Date();
  if (level === 'ERROR') console.error('[ERROR] ' + message);
  else console.log('[' + level + '] ' + message);

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('SystemLogs');
    if (!sheet) {
      sheet = ss.insertSheet('SystemLogs');
      sheet.appendRow(['Timestamp', 'Level', 'Message']);
      sheet.getRange('A1:C1').setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    sheet.appendRow([timestamp, level, message]);

    // Trim in one go every ~100 entries instead of deleting a row on every call.
    var lastRow = sheet.getLastRow();
    if (lastRow > 1100) {
      sheet.deleteRows(2, lastRow - 1000);
    }
  } catch (e) {
    console.error('Failed to write log to SystemLogs sheet: ' + e);
  }
}

// ==========================================
// PHONE NUMBERS SYNC
// ==========================================

/**
 * Fast dedicated function to scan all rows in the Google Sheet,
 * find students whose phone number is missing in Supabase, and update them.
 */
function syncMissingPhoneNumbers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SOURCE_SHEET_NAME);
  if (!sheet) {
    ss.toast('Sheet "' + SOURCE_SHEET_NAME + '" not found.', 'Error');
    return;
  }

  var lastRow = sheet.getLastRow();
  var numCols = sheet.getLastColumn();
  if (lastRow < 2 || numCols < 3) {
    ss.toast('No data in ' + SOURCE_SHEET_NAME, 'CRM Sync');
    return;
  }

  ss.toast('Fetching students from Supabase...', 'Phone Sync');
  var allStudents = _fetchAll('students', 'select=id,first_name,last_name,email,phone');
  if (!allStudents || allStudents.length === 0) {
    ss.toast('No students found in Supabase.', 'Error');
    return;
  }

  var studentsByEmail = {};
  var studentsByName = {};
  for (var i = 0; i < allStudents.length; i++) {
    var st = allStudents[i];
    if (st.email) {
      var emKey = String(st.email).trim().toLowerCase();
      if (!studentsByEmail[emKey]) studentsByEmail[emKey] = [];
      studentsByEmail[emKey].push(st);
    }
    var nameKey = (String(st.first_name || '').trim().toLowerCase() + '|' + String(st.last_name || '').trim().toLowerCase()).replace(/\s+/g, '');
    if (nameKey !== '|') {
      studentsByName[nameKey] = st;
    }
  }

  var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
  var headerMap = getSourceHeaderMap_(headers);

  if (headerMap.phone === -1) {
    ss.toast('Could not detect Phone column in ' + SOURCE_SHEET_NAME + '. Check column headers.', 'Error');
    return;
  }

  var values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  var updatedCount = 0;
  var alreadySetCount = 0;
  var notFoundCount = 0;

  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var rawPhone = row[headerMap.phone];
    var normalizedPhone = normalizePhone(rawPhone);
    if (!normalizedPhone) continue;

    var email = getRowEmail_(row, headerMap);

    var fName = headerMap.firstName !== -1 ? String(row[headerMap.firstName] || '').trim() : '';
    var lName = headerMap.lastName !== -1 ? String(row[headerMap.lastName] || '').trim() : '';

    var targetStudent = null;
    if (email && studentsByEmail[email]) {
      var candidates = studentsByEmail[email];
      for (var c = 0; c < candidates.length; c++) {
        if (areNamesSimilar_(fName, lName, candidates[c].first_name, candidates[c].last_name)) {
          targetStudent = candidates[c];
          break;
        }
      }
      if (!targetStudent && candidates.length === 1) {
        targetStudent = candidates[0];
      }
    }

    if (!targetStudent) {
      var nKey = (fName.toLowerCase() + '|' + lName.toLowerCase()).replace(/\s+/g, '');
      if (studentsByName[nKey]) {
        targetStudent = studentsByName[nKey];
      }
    }

    if (!targetStudent) {
      notFoundCount++;
      continue;
    }

    var currPhone = targetStudent.phone ? String(targetStudent.phone).trim() : '';
    if (!currPhone || currPhone === '' || currPhone === '+0000000') {
      var res = _fetch('students?id=eq.' + targetStudent.id, 'patch', { 
        phone: normalizedPhone,
        last_synced_at: new Date().toISOString()
      });
      if (res !== null) {
        targetStudent.phone = normalizedPhone;
        updatedCount++;
        Logger.log('Updated phone for ' + targetStudent.first_name + ' ' + targetStudent.last_name + ' (' + targetStudent.email + ') -> ' + normalizedPhone);
      }
    } else {
      alreadySetCount++;
    }
  }

  var summary = '✅ Done! Updated ' + updatedCount + ' phone numbers.';
  if (alreadySetCount > 0) summary += ' (' + alreadySetCount + ' already set)';
  ss.toast(summary, 'Phone Sync Complete');
}