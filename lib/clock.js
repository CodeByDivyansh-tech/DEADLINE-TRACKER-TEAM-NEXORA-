// The server's clock for code whose tests need to move time forward (Deep Focus sessions).
// DT_TEST_CLOCK_FILE names a file holding milliseconds to add to the real time. It is read only when the
// server runs with NODE_ENV=test (the test suite); in any other environment the real clock is always used.
const fs = require("fs");
const file = process.env.NODE_ENV === "test" ? process.env.DT_TEST_CLOCK_FILE : "";
function now(){
  if (!file) return Date.now();
  let off = 0; try { off = Number(fs.readFileSync(file, "utf8")) || 0; } catch (e) {}
  return Date.now() + off;
}
module.exports = { now };
