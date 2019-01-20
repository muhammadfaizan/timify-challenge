const { Schema } = require('mongoose');

module.exports = new Schema({
  doctorId: Schema.Types.ObjectId,
  roomId: Schema.Types.ObjectId,
  begin: Date,
  end: Date
});