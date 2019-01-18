const { Schema } = require('mongoose');

module.exports = new Schema({
  name: String,
  times:   [{begin: String, end: String}],
});