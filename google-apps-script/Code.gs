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
                       var uniqueKey = sId + "_" + cId + "_" + variants[v]; // Composite key
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
     _fetch('enrollments?on_conflict=student_id,course_id,course_variant', 'post', enrollmentsToUpsert, { 
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

/**
 * Syncs ALL data from Supabase to a "CRM Mirror" tab.
 * This is a one-way sync from Supabase -> Sheet.
 * It overwrites the mirror sheet entirely.
 */
function syncFromSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = "CRM Mirror";
  var sheet = ss.getSheetByName(sheetName);
  
  // Create if doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  ss.toast("Fetching data from Supabase...", "CRM Mirror Sync");
  
  // 1. Fetch Data
  var students = _fetch('students?select=*&order=id.asc', 'get');
  var courses = _fetch('courses?select=*&order=name.asc', 'get');
  var enrollments = _fetch('enrollments?select=*,course:courses(name)', 'get');
  
  if (!students || !courses || !enrollments) {
    ss.toast("Failed to fetch data. Check logs.", "CRM Mirror Sync");
    return;
  }
  
  // 2. Transform Data
  // Create a map of Student ID -> Enrollments
  var enrollmentMap = {};
  for (var i = 0; i < enrollments.length; i++) {
    var e = enrollments[i];
    if (!enrollmentMap[e.student_id]) {
      enrollmentMap[e.student_id] = {};
    }
    // Key by Course Name (since columns are by name)
    // format: "Variant - Status ⭐ (Confirmed: Date)"
    if (e.course && e.course.name) {
       var val = (e.course_variant || "Standard") + " - " + (e.status || "requested");
       
       // Add Priority Star
       if (e.is_priority) {
           val += " ⭐";
       }
       
       if (e.status === 'confirmed' && e.confirmed_date) {
           val += " (Confirmed: " + e.confirmed_date + ")";
       } else if (e.status === 'invited' && e.invited_date) {
           val += " (Invited: " + e.invited_date + ")";
       }
       
       enrollmentMap[e.student_id][e.course.name] = val;
    }
  }
  
  // Prepare Headers
  // Fixed: ID, Timestamp, First Name, Last Name, Mobile, Email, Address, Eircode, DOB
  var fixedHeaders = ['ID', 'Timestamp', 'First Name', 'Last Name', 'Mobile', 'Email', 'Address', 'Eircode', 'DOB'];
  var courseNames = courses.map(function(c) { return c.name; });
  var allHeaders = fixedHeaders.concat(courseNames);
  
  // Prepare Rows
  var outputRows = [];
  
  for (var i = 0; i < students.length; i++) {
    var s = students[i];
    var row = [];
    
    // Fixed Columns
    row.push(s.id); // Hidden ID column
    row.push(s.created_at || "");
    row.push(s.first_name || "");
    row.push(s.last_name || "");
    row.push(s.phone || "");
    row.push(s.email || "");
    row.push(s.address || "");
    row.push(s.eircode || "");
    row.push(s.dob || "");
    
    // Dynamic Course Columns
    var studentEnrollments = enrollmentMap[s.id] || {};
    for (var j = 0; j < courseNames.length; j++) {
      var cName = courseNames[j];
      row.push(studentEnrollments[cName] || "");
    }
    
    outputRows.push(row);
  }
  
  // 3. Write to Sheet
  sheet.clear();
  
  // Write Headers
  if (allHeaders.length > 0) {
    sheet.getRange(1, 1, 1, allHeaders.length).setValues([allHeaders])
         .setFontWeight("bold")
         .setBackground("#f3f3f3");
  }
  
  // Write Data
  if (outputRows.length > 0) {
    sheet.getRange(2, 1, outputRows.length, allHeaders.length).setValues(outputRows);
  }
  
  // Formatting
  sheet.setFrozenRows(1);
  sheet.hideColumns(1); // Hide ID column
  sheet.autoResizeColumns(2, allHeaders.length - 1); // Resize visible columns
  
  ss.toast("Sync complete! Updated " + outputRows.length + " students.", "CRM Mirror Sync");
}

/**
 * Installs the hourly trigger for the sync.
 * Run this once manually.
 */
function setupHourlyTrigger() {
  // Check if already exists to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncFromSupabase') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  ScriptApp.newTrigger('syncFromSupabase')
      .timeBased()
      .everyHours(1)
      .create();
      
  SpreadsheetApp.getActiveSpreadsheet().toast("Hourly sync trigger installed.", "CRM Setup");
}
