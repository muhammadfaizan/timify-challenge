const { Schema } = require('mongoose');
const RK = Schema.ObjectId;
module.exports = new Schema({
  doctorId: { type: RK, ref: 'Doctor' },
  roomId: { type: RK, ref: 'Room' },
  begin: Date,
  end: Date
});