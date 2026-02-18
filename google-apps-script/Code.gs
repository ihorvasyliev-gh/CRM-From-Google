// CONFIGURATION
var SUPABASE_URL = 'YOUR_SUPABASE_URL'; // e.g., https://xyz.supabase.co
var SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Service role key might be needed if RLS is strict, but Anon is fine if policies allow
var BATCH_SIZE = 50; // Process this many rows at a time to stay within limits

// Fixed column indices (1-based)
// 1: Timestamp, 2: First Name, 3: Last Name, 4: Mobile, 5: Email, 6: Address, 7: Eircode, 8: DOB
var FIXED_COL_COUNT = 8; 

// Global cache for Course Name -> ID mapping
var COURSE_CACHE = {}; 

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CRM Sync')
    .addItem('Sync All Rows (Batched)', 'syncAllRowsBatched')
    .addItem('Sync Recent (20)', 'syncAllRecent')
    .addToUi();
}

/**
 * Triggered on Form Submit. Syncs just the new row.
 */
function onFormSubmit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var row = e.range.getRow();
  syncRowsRange(sheet, row, row); // Sync single row range
}

/**
 * Triggers periodically. Syncs recent entries.
 */
function syncAllRecent() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var startRow = Math.max(2, lastRow - 20); 
  syncRowsRange(sheet, startRow, lastRow);
}

/**
 * Manual Trigger. Syncs ALL rows in batches.
 */
function syncAllRowsBatched() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getActiveSpreadsheet().toast('No data found.', 'CRM Sync');
    return;
  }
  
  SpreadsheetApp.getActiveSpreadsheet().toast('Starting full batch sync...', 'CRM Sync');
  
  // Warm up course cache once
  warmUpCourseCache();

  // Process in chunks of BATCH_SIZE
  for (var r = 2; r <= lastRow; r += BATCH_SIZE) {
    var endRow = Math.min(r + BATCH_SIZE - 1, lastRow);
    try {
      syncRowsRange(sheet, r, endRow);
      // Feedback
      SpreadsheetApp.getActiveSpreadsheet().toast('Synced rows ' + r + ' to ' + endRow, 'CRM Sync');
      // Gentle throttle
      Utilities.sleep(500); 
    } catch (e) {
      Logger.log("Error syncing batch " + r + "-" + endRow + ": " + e);
      SpreadsheetApp.getActiveSpreadsheet().toast('Error on batch ' + r + ': ' + e.toString().substring(0, 50), 'CRM Sync Error');
    }
  }
  
  SpreadsheetApp.getActiveSpreadsheet().toast('Full sync completed!', 'CRM Sync');
}

/**
 * Core Logic: Syncs a range of rows using Batch Upserts
 */
function syncRowsRange(sheet, startRow, endRow) {
  if (startRow > endRow) return;
  
  // Get Values
  var numRows = endRow - startRow + 1;
  var numCols = sheet.getLastColumn();
  // Get all data for this chunk
  // getRange(row, col, numRows, numCols)
  var rangeValues = sheet.getRange(startRow, 1, numRows, numCols).getValues();
  var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
  
  var studentsToUpsert = [];
  var rowMap = []; // Maps index in studentsToUpsert back to original row data for enrollment processing

  // 1. Prepare Student Data
  for (var i = 0; i < rangeValues.length; i++) {
    var rowData = rangeValues[i];
    var email = rowData[4];
    
    // Skip if no email (key identifier)
    if (!email || String(email).trim() === "") {
        Logger.log("Skipping row " + (startRow + i) + ": No email.");
        continue;
    }

    var studentData = {
      first_name: rowData[1],
      last_name: rowData[2],
      phone: String(rowData[3]),
      email: email, // Unique Key
      address: rowData[5],
      eircode: rowData[6],
      dob: formatDate(rowData[7]),
      last_synced_at: new Date().toISOString()
    };
    
    studentsToUpsert.push(studentData);
    rowMap.push({
      email: email,
      rowData: rowData
    });
  }

  if (studentsToUpsert.length === 0) return;

  // 2. Bulk Upsert Students
  // On conflict (email), update other fields.
  // Must use 'resolution=merge-duplicates' and preferably specify on_conflict column
  
  // Deduplicate locally first (in case sheet has duplicates in same batch)
  var uniqueStudents = [];
  var seenEmails = {};
  
  for (var k = 0; k < studentsToUpsert.length; k++) {
      var s = studentsToUpsert[k];
      if (!seenEmails[s.email]) {
          uniqueStudents.push(s);
          seenEmails[s.email] = true;
      }
  }

  // Use explicit on_conflict param for clarity
  var upsertedStudents = _fetch('students?on_conflict=email', 'post', uniqueStudents, { 
    'Prefer': 'resolution=merge-duplicates, return=representation' 
  });
  
  if (!upsertedStudents) {
      // If it fails, log the error but maybe don't crash the whole script?
      // Actually throwing here is correct so the batch marks as failed.
      throw new Error("Failed to upsert students batch.");
  }
  
  // Create Map: Email -> StudentID
  var emailToIdMap = {};
  for (var k = 0; k < upsertedStudents.length; k++) {
      var s = upsertedStudents[k];
      if (s.email) emailToIdMap[s.email] = s.id;
  }

  // 3. Prepare Enrollments
  var enrollmentsToUpsert = [];
  // Use a map to prevent duplicate enrollments within the same batch (student+course)
  var enrollmentKeys = {};
  
  for (var m = 0; m < rowMap.length; m++) {
      var mapItem = rowMap[m];
      var sId = emailToIdMap[mapItem.email];
      if (!sId) continue; // Should not happen if upsert succeeded

      var rData = mapItem.rowData;

      // Check dynamic columns
      for (var col = FIXED_COL_COUNT; col < headers.length; col++) {
          var courseName = headers[col];
          var cellValue = rData[col];
          
          if (courseName && cellValue && String(cellValue).trim() !== "") {
              var cId = getCourseId(courseName); // From cache or create
              if (cId) {
                  var variants = String(cellValue).split(',').map(function(s) { return s.trim(); });
                  for (var v = 0; v < variants.length; v++) {
                       var uniqueKey = sId + "_" + cId; // Composite key
                       if (!enrollmentKeys[uniqueKey]) {
                           enrollmentsToUpsert.push({
                               student_id: sId,
                               course_id: cId,
                               course_variant: variants[v],
                               status: 'requested' // Default status
                           });
                           enrollmentKeys[uniqueKey] = true;
                       }
                  }
              }
          }
      }
  }

  // 4. Bulk Upsert Enrollments
  // On conflict (student_id, course_id), ignore.
  // 'resolution=ignore-duplicates' is safer if we don't want to reset status.
  if (enrollmentsToUpsert.length > 0) {
     // Also specify on_conflict for clarity if needed, but ignore-duplicates usually suffices
     // The unique constraint is on (student_id, course_id)
     _fetch('enrollments?on_conflict=student_id,course_id', 'post', enrollmentsToUpsert, { 
        'Prefer': 'resolution=ignore-duplicates' 
     });
  }
}

// --- HELPER FUNCTIONS ---

function warmUpCourseCache() {
  var allCourses = _fetch('courses?select=id,name', 'get');
  if (allCourses) {
    for (var i = 0; i < allCourses.length; i++) {
        COURSE_CACHE[allCourses[i].name] = allCourses[i].id;
    }
  }
}

function getCourseId(name) {
  if (COURSE_CACHE[name]) return COURSE_CACHE[name];
  
  // Create if not exists (single check/create if missing from cache)
  // Double check API
  var res = _fetch('courses?name=eq.' + encodeURIComponent(name), 'get');
  if (res && res.length > 0) {
      COURSE_CACHE[name] = res[0].id;
      return res[0].id;
  }
  
  var newCourse = _fetch('courses', 'post', { name: name }, { 'Prefer': 'return=representation' });
  var id = newCourse && newCourse.length > 0 ? newCourse[0].id : null;
  if (id) COURSE_CACHE[name] = id;
  return id;
}

function _fetch(endpoint, method, payload, extraHeaders) {
  var url = SUPABASE_URL + '/rest/v1/' + endpoint;
  var headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
  };
  
  // Merge extra headers
  if (extraHeaders) {
      for (var k in extraHeaders) headers[k] = extraHeaders[k];
  }
  
  var options = {
    'method' : method,
    'headers': headers,
    'muteHttpExceptions': true
  };
  
  if (payload) {
    options.payload = JSON.stringify(payload);
  }

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var content = response.getContentText();
  
  if (code >= 200 && code < 300) {
    return content ? JSON.parse(content) : null;
  } else {
    Logger.log("Supabase Error [" + method + " " + endpoint + "] (" + code + "): " + content);
    return null;
  }
}

function formatDate(dateObj) {
  if (!dateObj) return null;
  if (typeof dateObj === 'string') return dateObj;
  try {
    return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy-MM-dd");
  } catch (e) {
    return null;
  }
}
