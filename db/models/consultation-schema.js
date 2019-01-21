const { Schema } = require('mongoose');
const RK = Schema.ObjectId;
module.exports = new Schema({
  id: String,
  doctorId: String,
  roomId: String,
  begin: Date,
  end: Date
});