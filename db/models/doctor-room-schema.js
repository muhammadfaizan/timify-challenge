const { Schema } = require('mongoose');

module.exports = new Schema({
  id: String,
  name: String,
  times: [{ begin: String, end: String }],
});