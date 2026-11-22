// Tracked source for the private `registration-intents-cleanup` function.
// Vercel matches `functions` in vercel.json against files in the Git upload.
// A file created only during `pnpm build` is not one of those files.
// The build writes the traced implementation next to this entry, and the
// Node builder follows this require after that write.
module.exports = require("../lib/schedules/registration-intents-cleanup-bundle.js");
