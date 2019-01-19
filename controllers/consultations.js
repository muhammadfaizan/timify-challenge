const { Room, Doctor, db } = require('../db/index');
const debug = require('debug')('timify:controllers:consultations')
const moment = require('moment');

const findAvailability = async (req, res, next) => {

}
const createConsultation = async (req, res, next) => { }
const getAllConsultations = async (req, res, next) => { }

module.exports = {
    findAvailability,
    createConsultation,
    getAllConsultations
}