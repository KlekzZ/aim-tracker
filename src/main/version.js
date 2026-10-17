// The version of the app CODE that is running. With code-only updates this
// can be newer than the installed .exe, so we read it from the package.json
// that sits next to this code instead of using app.getVersion().
const { version } = require('../../package.json');

module.exports = { codeVersion: version };
