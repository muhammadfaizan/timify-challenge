const { Schema } = require('mongoose');

module.exports = new Schema({
  name: String,
  times:   [{begin: String, end: String}],
  doctorId: Schema.Types.ObjectId,
  roomId: Schema.Types.ObjectId,
  begin: Date,
  end: Date
});