const { Room, Doctor, Consultation } = require('./models');
const mongoose = require('mongoose');
const debug = require('debug')('timify:db:index');

mongoose.connect(process.env.DB_URI, {
  useNewUrlParser: true,
  poolSize: 10
});
const db = mongoose.connection;

db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
  debug('connected to DB')
});

module.exports = {
  db,
  Room,
  Doctor,
  Consultation
}