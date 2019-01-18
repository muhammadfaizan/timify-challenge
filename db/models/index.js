const roomAndDoctorSchema = require('./doctor-room-schema');
const consultationSchema = require('./consultation-schema');
const mongoose = require('mongoose');
module.exports = {
    Room: mongoose.model('Room', roomAndDoctorSchema),
    Doctor: mongoose.model('Doctor', roomAndDoctorSchema),
    Consultation: mongoose.model('Blog', consultationSchema)
}