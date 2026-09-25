// ==========================================
// CONFIGURATION
// To set your credentials, go to:
// Project Settings → Script Properties → Add:
//   SUPABASE_URL = https://your-project.supabase.co
//   SUPABASE_KEY = your-service-role-key
// ==========================================

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
    .createMenu('🔄 CRM Sync (v2.4)')
    .addItem('⬇️ Upload from Supabase to CRM Mirror', 'syncFromSupabase')
    .addSeparator()
    .addItem('📞 Sync Missing Phone Numbers', 'syncMissingPhoneNumbers')
    .addItem('⬆️ Upload the last 20 to Supabase', 'syncAllRecent')
    .addItem('⬆️ Export ALL answers to Supabase', 'startFullSync')
    .addSeparator()
    .addItem('🛠 Settings: Triggers (Automation)', 'setupTriggers')
    .addItem('🛠 Configuration: Formatting CRM Mirror', 'setupMirrorSheetFormatting')
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

/**
 * Checks whether a header string corresponds to a standard student field
 * or non-course metadata rather than an actual course.
 */
function isNonCourseHeader_(header) {
  if (!header) return true;
  var h = String(header).trim().toLowerCase();
  if (!h) return true;
  
  // If header looks like an email address or contains @
  if (h.indexOf('@') !== -1) return true;

  // Email variants (e.g. Email address, E-mail, Email, Your email address, etc.)
  if (h.indexOf('email') !== -1 || h.indexOf('e-mail') !== -1 || h.indexOf('почта') !== -1 || h.indexOf('mail') !== -1 || h === 'username') return true;

  // Timestamp & metadata
  if (h.indexOf('timestamp') !== -1 || h.indexOf('отметка') !== -1 || h.indexOf('дата подачи') !== -1 || h.indexOf('submission') !== -1 || h.indexOf('score') !== -1 || h.indexOf('балл') !== -1) return true;

  // Personal info
  if (h.indexOf('first name') !== -1 || h.indexOf('first_name') !== -1 || h === 'имя' || h === 'firstname' || h === 'first-name') return true;
  if (h.indexOf('last name') !== -1 || h.indexOf('last_name') !== -1 || h.indexOf('surname') !== -1 || h === 'фамилия' || h === 'lastname' || h === 'last-name') return true;
  if (h.indexOf('full name') !== -1 || h.indexOf('fullname') !== -1 || h === 'фио') return true;
  if (isPhoneHeader_(h)) return true;
  if (h.indexOf('dob') !== -1 || h.indexOf('birth') !== -1 || h.indexOf('рождения') !== -1) return true;
  if (h.indexOf('eircode') !== -1 || h.indexOf('postcode') !== -1 || h.indexOf('zip') !== -1 || h.indexOf('индекс') !== -1 || h.indexOf('postal') !== -1) return true;
  if (h.indexOf('address') !== -1 || h.indexOf('адрес') !== -1 || h.indexOf('street') !== -1) return true;

  // Additional non-course fields
  if (h.indexOf('consent') !== -1 || h.indexOf('gdpr') !== -1 || h.indexOf('agreement') !== -1 || h.indexOf('согласие') !== -1) return true;
  if (h.indexOf('gender') !== -1 || h.indexOf('пол') !== -1) return true;
  if (h.indexOf('age') !== -1 || h.indexOf('возраст') !== -1) return true;
  if (h.indexOf('pps') !== -1 || h.indexOf('ppsn') !== -1) return true;
  if (h.indexOf('comment') !== -1 || h.indexOf('notes') !== -1 || h.indexOf('комментар') !== -1 || h.indexOf('feedback') !== -1) return true;
  if (h.indexOf('nationality') !== -1 || h.indexOf('гражданство') !== -1) return true;

  return false;
}

/**
 * Helper to identify column indices dynamically by analyzing header names.
 */
function getSourceHeaderMap_(headers) {
  var map = {
    timestamp: -1,
    firstName: -1,
    lastName: -1,
    phone: -1,
    email: -1,
    emailIndices: [],
    address: -1,
    eircode: -1,
    dob: -1,
    courseIndices: []
  };

  var knownIndices = {};

  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || "").trim().toLowerCase();
    if (!h) continue;

    if (h.indexOf('email') !== -1 || h.indexOf('e-mail') !== -1 || h.indexOf('почта') !== -1 || h.indexOf('mail') !== -1 || h === 'username') {
      if (map.email === -1) map.email = c;
      map.emailIndices.push(c);
      knownIndices[c] = true;
    } else if (h.indexOf('timestamp') !== -1 || h.indexOf('отметка') !== -1 || h.indexOf('дата подачи') !== -1 || h.indexOf('submission') !== -1) {
      if (map.timestamp === -1) map.timestamp = c;
      knownIndices[c] = true;
    } else if (h.indexOf('first name') !== -1 || h.indexOf('first_name') !== -1 || h === 'имя' || h === 'firstname' || h === 'first-name') {
      if (map.firstName === -1) map.firstName = c;
      knownIndices[c] = true;
    } else if (h.indexOf('last name') !== -1 || h.indexOf('last_name') !== -1 || h.indexOf('surname') !== -1 || h === 'фамилия' || h === 'lastname' || h === 'last-name') {
      if (map.lastName === -1) map.lastName = c;
      knownIndices[c] = true;
    } else if (isPhoneHeader_(h)) {
      if (map.phone === -1) map.phone = c;
      knownIndices[c] = true;
    } else if (h.indexOf('dob') !== -1 || h.indexOf('birth') !== -1 || h.indexOf('рождения') !== -1) {
      if (map.dob === -1) map.dob = c;
      knownIndices[c] = true;
    } else if (h.indexOf('eircode') !== -1 || h.indexOf('postcode') !== -1 || h.indexOf('zip') !== -1 || h.indexOf('индекс') !== -1 || h.indexOf('postal') !== -1) {
      if (map.eircode === -1) map.eircode = c;
      knownIndices[c] = true;
    } else if (h.indexOf('address') !== -1 || h.indexOf('адрес') !== -1 || h.indexOf('street') !== -1) {
      if (map.address === -1) map.address = c;
      knownIndices[c] = true;
    } else if (isNonCourseHeader_(h)) {
      knownIndices[c] = true;
    }
  }

  // Safe fallbacks only for columns not explicitly identified and not colliding with already identified columns
  if (map.timestamp === -1 && headers.length > 0 && !knownIndices[0]) map.timestamp = 0;
  if (map.firstName === -1 && headers.length > 1 && !knownIndices[1]) map.firstName = 1;
  if (map.lastName === -1 && headers.length > 2 && !knownIndices[2]) map.lastName = 2;
  if (map.phone === -1 && headers.length > 3 && !knownIndices[3]) map.phone = 3;
  if (map.email === -1 && headers.length > 4 && !knownIndices[4]) {
    map.email = 4;
    map.emailIndices.push(4);
  }
  if (map.address === -1 && headers.length > 5 && !knownIndices[5]) map.address = 5;
  if (map.eircode === -1 && headers.length > 6 && !knownIndices[6]) map.eircode = 6;
  if (map.dob === -1 && headers.length > 7 && !knownIndices[7]) map.dob = 7;

  if (map.timestamp !== -1) knownIndices[map.timestamp] = true;
  if (map.firstName !== -1) knownIndices[map.firstName] = true;
  if (map.lastName !== -1) knownIndices[map.lastName] = true;
  if (map.phone !== -1) knownIndices[map.phone] = true;
  if (map.email !== -1) knownIndices[map.email] = true;
  if (map.address !== -1) knownIndices[map.address] = true;
  if (map.eircode !== -1) knownIndices[map.eircode] = true;
  if (map.dob !== -1) knownIndices[map.dob] = true;

  // Remaining columns are course columns (as long as they are not marked non-course)
  for (var i = 0; i < headers.length; i++) {
    if (!knownIndices[i] && headers[i] && String(headers[i]).trim() !== "") {
      if (!isNonCourseHeader_(headers[i])) {
        map.courseIndices.push(i);
      }
    }
  }

  return map;
}

/**
 * Triggered on Form Submit. Syncs just the new row.
 */
function onFormSubmit(e) {
  try {
    log_('onFormSubmit trigger started [v2.4]', 'INFO');
    if (!e || !e.range) {
      log_('onFormSubmit: Event object or range is missing', 'WARN');
      return;
    }
    var sheet = e.range.getSheet();
    var sheetName = sheet.getName();
    log_('onFormSubmit: Form submitted to sheet "' + sheetName + '"', 'INFO');
    
    if (sheetName !== SOURCE_SHEET_NAME) {
      log_('onFormSubmit: Sheet name "' + sheetName + '" does not match expected source sheet "' + SOURCE_SHEET_NAME + '". Skipping.', 'INFO');
      return;
    }
    
    warmUpCourseCache();
    
    var row = e.range.getRow();
    log_('onFormSubmit: Starting sync for row ' + row, 'INFO');
    syncRowsRange(sheet, row, row);
    log_('onFormSubmit: Row ' + row + ' sync completed successfully', 'INFO');
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
    ss.toast('Лист ' + SOURCE_SHEET_NAME + ' не найден.', 'Ошибка');
    return;
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
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
  var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
  var headerMap = getSourceHeaderMap_(headers);
  
  var studentsToUpsert = [];
  var rowMap = []; 

  for (var i = 0; i < rangeValues.length; i++) {
    var rowData = rangeValues[i];
    var email = "";
    if (headerMap.email !== -1 && rowData[headerMap.email]) {
      email = String(rowData[headerMap.email]).trim();
    }
    // Fallback to any other email column if primary is empty
    if (!email && headerMap.emailIndices && headerMap.emailIndices.length > 0) {
      for (var ei = 0; ei < headerMap.emailIndices.length; ei++) {
        var altVal = rowData[headerMap.emailIndices[ei]];
        if (altVal && String(altVal).trim()) {
          email = String(altVal).trim();
          break;
        }
      }
    }
    
    if (!email || String(email).trim() === "") continue;

    var fName = headerMap.firstName !== -1 ? String(rowData[headerMap.firstName] || "").trim() : "";
    var lName = headerMap.lastName !== -1 ? String(rowData[headerMap.lastName] || "").trim() : "";
    var eMail = String(email).trim().toLowerCase();
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

  // Build Enrollments
  // 1. Fetch existing enrollments for matched students to prevent creating duplicate enrollments
  // when a student is already enrolled (requested, invited, confirmed, completed) in a course.
  var batchStudentIds = [];
  for (var k in keyToIdMap) {
    if (keyToIdMap[k] && batchStudentIds.indexOf(keyToIdMap[k]) === -1) {
      batchStudentIds.push(keyToIdMap[k]);
    }
  }

  var existingEnrollmentsByStudentAndCourse = {};
  if (batchStudentIds.length > 0) {
    var enrData = _fetch('enrollments?select=id,student_id,course_id,status,course_variant&student_id=in.' + pgrstInList_(batchStudentIds), 'get') || [];
    for (var eIdx = 0; eIdx < enrData.length; eIdx++) {
      var enr = enrData[eIdx];
      existingEnrollmentsByStudentAndCourse[enr.student_id + "_" + enr.course_id] = enr;
    }
  }

  var enrollmentsToUpsert = [];
  var enrollmentKeys = {};
  
  for (var m = 0; m < rowMap.length; m++) {
    var mapItem = rowMap[m];
    var sId = keyToIdMap[mapItem.key];
    if (!sId) continue; 

    var rData = mapItem.rowData;
    var rowTimestampIso = formatIsoDateTime(mapItem.rawTimestamp);

    for (var cIdx = 0; cIdx < headerMap.courseIndices.length; cIdx++) {
      var col = headerMap.courseIndices[cIdx];
      var courseName = headers[col];
      var cellValue = rData[col];
      
      if (courseName && !isNonCourseHeader_(courseName) && courseName.indexOf('@') === -1 && cellValue && String(cellValue).trim() !== "") {
        var strVal = String(cellValue).trim();
        // Skip if cell value looks like an email address or contains @
        if (strVal.indexOf('@') !== -1 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strVal)) {
          continue;
        }
        var cId = getCourseId(courseName); 
        if (cId) {
          // If student already has an active enrollment in this course, do not create a duplicate!
          var existingEnr = existingEnrollmentsByStudentAndCourse[sId + "_" + cId];
          if (existingEnr && existingEnr.status !== 'withdrawn' && existingEnr.status !== 'rejected') {
            Logger.log('Student ' + sId + ' already has enrollment in course ' + cId + ' with status "' + existingEnr.status + '". Skipping duplicate enrollment creation.');
            continue;
          }

          var variants = strVal.split(',').map(function(s) { return s.trim(); });
          for (var v = 0; v < variants.length; v++) {
            var varText = variants[v];
            if (!varText) continue;
            // Skip variant if it looks like an email address or contains @
            if (varText.indexOf('@') !== -1 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(varText)) {
              continue;
            }
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
      if (emptyPages >= 2) hasMore = false;
      else hasMore = false;
    }
  }
  return allData;
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
      var normalized = normalizeCourseName_(allCourses[i].name);
      COURSE_CACHE[normalized] = allCourses[i].id;
      COURSE_CACHE[allCourses[i].name] = allCourses[i].id;
    }
  }
}

/**
 * Gets a course ID by name.
 */
function getCourseId(name) {
  var normalized = normalizeCourseName_(name);
  if (!normalized) return null;
  if (normalized.indexOf('@') !== -1 || /email|e-mail|почта|username/i.test(normalized) || isNonCourseHeader_(normalized)) {
    Logger.log('Ignored non-course name in getCourseId: "' + normalized + '"');
    return null;
  }
  
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

/**
 * Formats a date/datetime value for CRM Mirror Sheet display (dd/MM/yyyy).
 * Bulletproof against timezone day-shifts for ISO strings.
 */
function formatDateForSheet(dateVal) {
  if (!dateVal || String(dateVal).trim() === "") return "";
  
  if (dateVal instanceof Date) {
    if (isNaN(dateVal.getTime())) return "";
    return Utilities.formatDate(dateVal, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }
  
  var str = String(dateVal).trim();
  
  // Direct parse for YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  var isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    // If date-only (like DOB), avoid timezone shifts entirely:
    if (str.length === 10) {
      return isoMatch[3] + "/" + isoMatch[2] + "/" + isoMatch[1];
    }
    var dIso = new Date(str);
    if (!isNaN(dIso.getTime())) {
      return Utilities.formatDate(dIso, Session.getScriptTimeZone(), "dd/MM/yyyy");
    }
  }

  // Direct parse for DD/MM/YYYY
  var dmyMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/);
  if (dmyMatch) {
    var day = parseInt(dmyMatch[1], 10);
    var month = parseInt(dmyMatch[2], 10);
    var year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    var dStr = day < 10 ? "0" + day : "" + day;
    var mStr = month < 10 ? "0" + month : "" + month;
    return dStr + "/" + mStr + "/" + year;
  }
  
  try {
    var d = new Date(str);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
    }
  } catch (e) {}

  return str;
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
  
  var studentFlags = _fetchAll('student_flags', 'select=*,courses(name)');
  if (!studentFlags) studentFlags = [];
  
  ss.toast("Processing " + students.length + " students, " + enrollments.length + " enrollments, " + studentFlags.length + " flags...", "CRM Mirror Sync");
  
  // ── 2. Build lookup maps ──────────────────────────────────────
  var studentMap = {};
  var enrolledStudentIds = {};
  for (var i = 0; i < students.length; i++) {
    studentMap[students[i].id] = students[i];
  }
  
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
    'Flags',              // F
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
    'Completed Date',     // R
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
  
  var lastRowCurrent = sheet.getLastRow();
  var lastColCurrent = sheet.getLastColumn();
  if (lastRowCurrent > 1 && lastColCurrent > 0) {
    sheet.getRange(2, 1, lastRowCurrent - 1, Math.max(lastColCurrent, headers.length)).clearContent();
  }
  
  // Write Headers
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers])
    .setFontWeight("bold")
    .setFontSize(10)
    .setFontColor("#ffffff")
    .setBackground("#1a237e")
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
  
  if (numDataRows > 0) {
    sheet.getRange("M2:M").setNumberFormat("dd/MM/yyyy"); // DOB
    sheet.getRange("P2:P").setNumberFormat("dd/MM/yyyy"); // Invited Date
    sheet.getRange("Q2:Q").setNumberFormat("dd/MM/yyyy"); // Confirmed Date
    sheet.getRange("R2:R").setNumberFormat("dd/MM/yyyy"); // Completed Date
    sheet.getRange("S2:S").setNumberFormat("dd/MM/yyyy"); // Created At
  }
  
  if (numDataRows > 0) {
    var centerCols = ['D', 'E', 'L', 'M', 'P', 'Q', 'R', 'S'];
    for (var ci = 0; ci < centerCols.length; ci++) {
      sheet.getRange(centerCols[ci] + "2:" + centerCols[ci]).setHorizontalAlignment("center");
    }
    
    sheet.getRange("G2:G").setFontWeight("bold"); // First Name
    sheet.getRange("H2:H").setFontWeight("bold"); // Last Name
    
    sheet.getRange("F2:F").setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    sheet.getRange("K2:K").setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    sheet.getRange("T2:T").setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  }
  
  try {
    var bandings = sheet.getBandings();
    for (var b = 0; b < bandings.length; b++) {
      bandings[b].remove();
    }
    
    if (numDataRows > 0) {
      var bandRange = sheet.getRange(1, 1, numDataRows + 1, numCols);
      bandRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
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
  
  sheet.setFrozenRows(1);
  
  sheet.hideColumns(1); // System ID
  sheet.hideColumns(2); // Enrollment ID 
  sheet.hideColumns(3); // Student ID
  
  try {
    if (sheet.getFilter() !== null) {
      sheet.getFilter().remove();
    }
    sheet.getRange(1, 1, sheet.getMaxRows(), Math.max(sheet.getLastColumn(), numCols)).createFilter();
  } catch (filterErr) {
    Logger.log("Filter error (non-critical): " + filterErr);
  }
  
  try {
    sheet.clearConditionalFormatRules();
    
    var statusRange = sheet.getRange("D2:D");
    var flagsRange = sheet.getRange("F2:F");
    var priorityRange = sheet.getRange("E2:E");
    
    var rules = [];
    
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
    
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextStartsWith('⚠').setBackground('#fff3e0').setFontColor('#e65100').setBold(true)
      .setRanges([flagsRange]).build());
    
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains('⭐').setBackground('#fff8e1').setFontColor('#ff8f00').setBold(true)
      .setRanges([priorityRange]).build());
    
    sheet.setConditionalFormatRules(rules);
  } catch (fmtErr) {
    Logger.log("Conditional formatting error (non-critical): " + fmtErr);
  }
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

/**
 * Logs a message to the Google Sheet (SystemLogs) and standard Logger.
 */
function log_(message, level) {
  level = level || 'INFO';
  var timestamp = new Date();
  
  var formattedMsg = '[' + level + '] ' + message;
  if (level === 'ERROR') {
    console.error(formattedMsg);
    Logger.log(formattedMsg);
  } else {
    console.log(formattedMsg);
    Logger.log(formattedMsg);
  }

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
    
    var lastRow = sheet.getLastRow();
    if (lastRow > 1000) {
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

    var email = '';
    if (headerMap.email !== -1 && row[headerMap.email]) {
      email = String(row[headerMap.email]).trim().toLowerCase();
    }
    if (!email && headerMap.emailIndices && headerMap.emailIndices.length > 0) {
      for (var ei = 0; ei < headerMap.emailIndices.length; ei++) {
        var altVal = row[headerMap.emailIndices[ei]];
        if (altVal && String(altVal).trim()) {
          email = String(altVal).trim().toLowerCase();
          break;
        }
      }
    }

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